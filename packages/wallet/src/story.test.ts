import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { keyId } from "@hundi/core/bytes";
import { sleep, spawn, which } from "bun";
import {
  type Address,
  createPublicClient,
  createTestClient,
  erc20Abi,
  http,
  type PublicClient,
  parseEther,
} from "viem";
import { vaultAbi } from "./abi.generated";
import { USDT, VAULT, whitechainSepolia } from "./chain-io";
import { deviceKeyFrom, generateKeyPair } from "./keystore";
import { memoryStore } from "./store";
import { openWallet, usdt, type Wallet } from "./wallet";

/**
 * PLAN.md Appendix F against the deployed testnet vault, on a local fork.
 * While `offline` is true every RPC call throws, so the offline half has to
 * work with no network, not just pretend to.
 */
const PORT = 8599;
const URL = `http://127.0.0.1:${PORT}`;
const FORK_RPC = "https://rpc.testnet.whitechain.io/";
const RELAYER = "0x7580eD603Ca084d4990650cdEd1990bE8bbd2694";
const anvil = which("anvil") ?? which(`${process.env.HOME}/.foundry/bin/anvil`);

let offline = false;
const guardedFetch: typeof fetch = ((input, init) => {
  if (offline) {
    throw new Error("Airplane mode");
  }
  return fetch(input, init);
}) as typeof fetch;
const transport = http(URL, { fetchFn: guardedFetch, retryCount: 0 });

const reads = createPublicClient({
  chain: whitechainSepolia,
  pollingInterval: 100,
  transport,
}) as PublicClient;
const control = createTestClient({
  chain: whitechainSepolia,
  mode: "anvil",
  transport: http(URL),
});

const usdtOf = (owner: Address) =>
  reads.readContract({
    abi: erc20Abi,
    address: USDT,
    args: [owner],
    functionName: "balanceOf",
  });

const bondOf = async (wallet: Wallet) => {
  const [amount] = await reads.readContract({
    abi: vaultAbi,
    address: VAULT,
    args: [keyId(wallet.key)],
    functionName: "bonds",
  });
  return amount;
};

const newWallet = async (store = memoryStore()) =>
  openWallet({
    device: await deviceKeyFrom(await generateKeyPair()),
    reads,
    store,
    writes: transport,
  });

const fund = async (wallet: Wallet, amount: bigint) => {
  await control.setBalance({
    address: wallet.address,
    value: parseEther("1"),
  });
  await control.impersonateAccount({ address: RELAYER });
  await control.setBalance({ address: RELAYER, value: parseEther("1") });
  const hash = await control
    .extend(() => ({}))
    .request({
      method: "eth_sendTransaction",
      params: [
        {
          data: `0xa9059cbb${wallet.address.slice(2).padStart(64, "0")}${amount
            .toString(16)
            .padStart(64, "0")}`,
          from: RELAYER,
          to: USDT,
        },
      ],
    } as never);
  await reads.waitForTransactionReceipt({ hash: hash as `0x${string}` });
};

describe.skipIf(!anvil)("Appendix F story", () => {
  let server: ReturnType<typeof spawn>;

  beforeAll(async () => {
    server = spawn(
      [
        anvil as string,
        "--fork-url",
        FORK_RPC,
        "--hardfork",
        "osaka",
        "--port",
        String(PORT),
        "--silent",
      ],
      { stderr: "ignore", stdout: "ignore" }
    );
    const waitForAnvil = async (attempts: number): Promise<void> => {
      const up = await reads.getChainId().catch(() => 0);
      if (up === whitechainSepolia.id) {
        return;
      }
      if (attempts === 0) {
        throw new Error("anvil did not start");
      }
      await sleep(100);
      await waitForAnvil(attempts - 1);
    };
    await waitForAnvil(100);
  }, 30_000);

  afterAll(() => {
    server.kill();
  });

  test("honest note settled, forked note settled, victim paid from bond", async () => {
    const customer = await newWallet();
    const stall = await newWallet();
    const supplier = await newWallet();
    await fund(customer, usdt(30));
    await fund(stall, usdt(10));
    await control.setBalance({
      address: supplier.address,
      value: parseEther("1"),
    });

    // Online, before the outage.
    await customer.load({ bond: usdt(20), notes: [usdt(5), usdt(5)] });
    await stall.load({ bond: usdt(10), notes: [] });
    await Promise.all([customer.sync(), stall.sync(), supplier.sync()]);
    const burnedBefore = await reads.readContract({
      abi: vaultAbi,
      address: VAULT,
      functionName: "burned",
    });

    // Airplane mode from here.
    offline = true;
    await expect(reads.getBlockNumber()).rejects.toThrow();

    // 0:30 The customer pays the stall note 1.
    const toStall = stall.request(usdt(5));
    const first = await customer.pay(toStall);
    expect(await stall.receive(first, toStall)).toEqual({
      amount: usdt(5),
      ok: true,
    });

    // Showing the QR twice re-shows the same hop.
    expect(await customer.pay(toStall)).toEqual(first);

    // 0:55 The stall pays the supplier with note 1. The money moved twice.
    const toSupplier = supplier.request(usdt(5));
    const onward = await stall.pay(toSupplier);
    expect(onward.hops.length).toBe(2);
    expect(await supplier.receive(onward, toSupplier)).toEqual({
      amount: usdt(5),
      ok: true,
    });

    // The guard stops an accidental double-spend of a note offered elsewhere.
    const secondToStall = stall.request(usdt(5));
    const note2 = await customer.pay(secondToStall);
    const secondToSupplier = supplier.request(usdt(5));
    await expect(customer.pay(secondToSupplier)).rejects.toThrow("No note");

    // 1:20 The customer turns the guard off and pays note 2 to both.
    await customer.updateSettings({ guard: false });
    const fork = await customer.pay(secondToSupplier);
    expect(fork.header).toEqual(note2.header);
    expect(await stall.receive(note2, secondToStall)).toMatchObject({
      ok: true,
    });
    expect(await supplier.receive(fork, secondToSupplier)).toMatchObject({
      ok: true,
    });

    // A replay of a note the stall already holds is refused with no network.
    const replay = stall.request(usdt(5));
    expect(
      await stall.receive({ ...note2, requestId: replay.requestId }, replay)
    ).toEqual({ ok: false, reason: "seen_before" });

    offline = false;

    // 1:50 The supplier settles first: both notes pay from escrow.
    const supplierReport = await supplier.settle();
    expect(supplierReport.map((r) => r.kind)).toEqual(["paid", "paid"]);
    expect(await usdtOf(supplier.address)).toBe(usdt(10));

    // 2:10 The stall settles the forked note and is paid from the cheater's bond.
    const stallReport = await stall.settle();
    expect(stallReport.map((r) => r.kind)).toEqual(["covered"]);
    expect(await usdtOf(stall.address)).toBe(usdt(5));
    expect(await bondOf(customer)).toBe(usdt(10));
    expect(await bondOf(stall)).toBe(usdt(10));
    expect(
      await reads.readContract({
        abi: vaultAbi,
        address: VAULT,
        functionName: "burned",
      })
    ).toBe(burnedBefore + usdt(5));

    // Settling again finds nothing to do, and pays nothing twice.
    expect(await supplier.settle()).toEqual([]);
    expect(await usdtOf(supplier.address)).toBe(usdt(10));

    // Every device now sees note 1 as spent.
    await customer.sync();
    const facts = [...(await customer.snapshot()).notes.values()];
    expect(facts.filter((note) => note.settled).length).toBeGreaterThan(1);
  }, 120_000);

  test("settle is idempotent after a lost reply", async () => {
    const customer = await newWallet();
    const stallStore = memoryStore();
    const stall = await newWallet(stallStore);
    await fund(customer, usdt(15));
    await control.setBalance({
      address: stall.address,
      value: parseEther("1"),
    });
    await customer.load({ bond: usdt(10), notes: [usdt(5)] });
    await stall.sync();
    const target = stall.request(usdt(5));
    await stall.receive(await customer.pay(target), target);
    const [record] = await stall.notes();
    if (record?.state.kind !== "held") {
      throw new Error("The stall should hold the note");
    }
    const { note } = record.state;

    const [first] = await stall.settle();
    expect(first?.kind).toBe("paid");
    expect(await usdtOf(stall.address)).toBe(usdt(5));

    // The transaction landed, but the device never heard back.
    await stallStore.putNote(record.id, { kind: "held", note });
    const [retry] = await stall.settle();

    expect(retry).toEqual({
      kind: "already",
      noteId: record.id,
      txHash: (first as { txHash: `0x${string}` }).txHash,
    });
    expect(await usdtOf(stall.address)).toBe(usdt(5));
    expect((await stall.notes())[0]?.state.kind).toBe("settled");
    expect(await stall.settle()).toEqual([]);
  }, 120_000);
});
