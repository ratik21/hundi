import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { keyId } from "@hundi/core/bytes";
import { serve, sleep, spawn, which } from "bun";
import {
  type Address,
  createPublicClient,
  createTestClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  http,
  type PublicClient,
  parseEther,
  toHex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createHandler } from "../../../apps/relayer/src/handler";
import { fixedWindowLimiter } from "../../../apps/relayer/src/policy";
import { vaultAbi } from "./abi.generated";
import { relayerFrom, USDT, VAULT, whitechainSepolia } from "./chain-io";
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

const newWallet = async (
  store = memoryStore(),
  relayer?: string | (() => Promise<string | undefined>)
) =>
  openWallet({
    device: await deviceKeyFrom(await generateKeyPair()),
    reads,
    ...(relayer ? { relayer } : {}),
    store,
    writes: transport,
  });

/** Mints fork-only USDT, so these tests never depend on a real balance. */
const fund = async (wallet: Wallet, amount: bigint, gas = parseEther("1")) => {
  await control.setBalance({ address: wallet.address, value: gas });
  await control.request({
    method: "anvil_dealERC20",
    params: [wallet.address, USDT, toHex(amount)],
  } as never);
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

  test("a load shows on this device even when the RPC head lags a block", async () => {
    const lagging = {
      ...reads,
      getBlockNumber: async () =>
        (await reads.getBlockNumber({ cacheTime: 0 })) - 1n,
    } as PublicClient;
    const customer = await openWallet({
      device: await deviceKeyFrom(await generateKeyPair()),
      reads: lagging,
      store: memoryStore(),
      writes: transport,
    });
    await fund(customer, usdt(15));

    await customer.load({ bond: usdt(10), notes: [usdt(5)] });

    expect(await customer.deposit()).toBe(usdt(10));
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

  describe("relayer", () => {
    const RELAYER_PORT = 8600;
    const RELAYER_URL = `http://127.0.0.1:${RELAYER_PORT}`;
    const relayerAccount = privateKeyToAccount(generatePrivateKey());
    const sent: object[] = [];
    let relayer: ReturnType<typeof serve>;

    const post = (body: unknown) =>
      fetch(`${RELAYER_URL}/submit`, {
        body: JSON.stringify(body),
        method: "POST",
      });

    beforeAll(async () => {
      await control.setBalance({
        address: relayerAccount.address,
        value: parseEther("1"),
      });
      const handle = createHandler({
        account: relayerAccount,
        limiter: fixedWindowLimiter(1000, 60_000),
        log: (fields) => sent.push(fields),
        reads,
        wallet: createWalletClient({
          account: relayerAccount,
          chain: whitechainSepolia,
          transport,
        }),
      });
      relayer = serve({
        fetch: (request) => handle(request, "test"),
        port: RELAYER_PORT,
      });
    });

    afterAll(() => {
      relayer.stop(true);
    });

    test("a device with no gas loads and settles through the relayer", async () => {
      const customer = await newWallet(memoryStore(), RELAYER_URL);
      const stall = await newWallet(memoryStore(), RELAYER_URL);
      await fund(customer, usdt(15.1), 0n);
      expect(await reads.getBalance({ address: customer.address })).toBe(0n);
      expect(await reads.getBalance({ address: stall.address })).toBe(0n);

      await customer.load({ bond: usdt(10), notes: [usdt(5)] });
      await stall.sync();
      const target = stall.request(usdt(5));
      await stall.receive(await customer.pay(target), target);

      const before = await usdtOf(relayerAccount.address);
      const [report] = await stall.settle();

      expect(report).toMatchObject({ kind: "paid", paid: usdt(4.9) });
      expect(await usdtOf(stall.address)).toBe(usdt(4.9));
      expect(await usdtOf(relayerAccount.address)).toBe(before + usdt(0.1));
      expect(await reads.getBalance({ address: stall.address })).toBe(0n);
    }, 120_000);

    test("Submit directly works when the relayer lookup is gone", async () => {
      const customer = await newWallet();
      const stall = await newWallet(memoryStore(), () =>
        Promise.reject(new Error("The domain is gone"))
      );
      await fund(customer, usdt(15));
      await control.setBalance({
        address: stall.address,
        value: parseEther("1"),
      });
      await customer.load({ bond: usdt(10), notes: [usdt(5)] });
      await stall.sync();
      const target = stall.request(usdt(5));
      await stall.receive(await customer.pay(target), target);

      await stall.updateSettings({ submitDirectly: true });
      const [report] = await stall.settle();

      expect(report).toMatchObject({ kind: "paid", paid: usdt(5) });
    }, 120_000);

    test("a dead relayer domain reads as no relayer", async () => {
      const lookup = relayerFrom("http://127.0.0.1:1/relayer.txt");
      expect(await lookup()).toBeUndefined();
    });

    test("refuses any call but load and settle, and sends nothing", async () => {
      const nonce = await reads.getTransactionCount({
        address: relayerAccount.address,
      });
      const reclaim = encodeFunctionData({
        abi: vaultAbi,
        args: [`0x${"00".repeat(32)}`],
        functionName: "reclaim",
      });
      expect((await post({ data: reclaim })).status).toBe(403);
      expect((await post({ data: "0xa9059cbb" })).status).toBe(403);
      expect((await post({ data: "nope" })).status).toBe(400);
      expect(
        await reads.getTransactionCount({ address: relayerAccount.address })
      ).toBe(nonce);
    });

    test("refuses a settle that would fail, and sends nothing", async () => {
      const customer = await newWallet();
      const stall = await newWallet();
      await fund(customer, usdt(15));
      await customer.load({ bond: usdt(10), notes: [usdt(5)] });
      await stall.sync();
      const target = stall.request(usdt(5));
      const payment = await customer.pay(target);
      const nonce = await reads.getTransactionCount({
        address: relayerAccount.address,
      });
      const forged = encodeFunctionData({
        abi: vaultAbi,
        args: [
          {
            expiry: payment.header.expiry,
            face: payment.header.face,
            serial: payment.header.serial,
            x: payment.header.owner.x,
            y: payment.header.owner.y,
          },
          [],
          {
            fee: usdt(1),
            payTo: relayerAccount.address,
            r: `0x${"11".repeat(32)}`,
            s: `0x${"22".repeat(32)}`,
          },
        ],
        functionName: "settle",
      });
      const response = await post({ data: forged });
      expect(response.status).toBe(422);
      expect(
        await reads.getTransactionCount({ address: relayerAccount.address })
      ).toBe(nonce);
    }, 120_000);

    test("refuses a fee below the gas cost, and sends nothing", async () => {
      const customer = await newWallet();
      await fund(customer, usdt(15));
      await customer.load({ bond: usdt(10), notes: [usdt(5)] });

      // A real, valid owner settle that offers no fee, so simulation passes.
      const [record] = await customer.notes();
      if (record?.state.kind !== "held") {
        throw new Error("The customer should hold the note");
      }
      const data = await customer.settleCalldata(record.state.note, 0n);
      const nonce = await reads.getTransactionCount({
        address: relayerAccount.address,
      });
      expect((await post({ data })).status).toBe(402);
      expect(
        await reads.getTransactionCount({ address: relayerAccount.address })
      ).toBe(nonce);
    }, 120_000);
  });
});
