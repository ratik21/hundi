# Decisions

The main calls behind Hundi, and why I made them.

## Why this idea

My first idea was a payments product where the main feature was reminders. I dropped it. I couldn't see a real use case, and reminders are not a moat. I threw out a few more ideas too, including an alert tool that was really just an indexer.

I wanted to build something actually useful, not just try to win money, and I was OK to give up prize money for that.

Hundi is useful. When the network goes down, people can't reach their money, and most crypto apps don't help with that.

## Why notes

I rejected cheques against a shared balance. Offline, a payer can sign as many as they want and receivers can't see each other, so there is no limit on the overspend.

A note has a fixed value with USDT locked behind it, so a phone can check it with no network. The receiver can also spend it again while still offline. Most offline payment ideas can't do that.

## Why deposits

Offline, nothing can stop someone spending a note twice. So I made it costly. You need a safety deposit to spend, and every phone checks it before accepting a payment.

## Why claims burn money

If a claim pays out in full, a double-spender can get their own deposit back through a second key, so a double-spend costs nothing. So a claim takes double from their deposit. Half pays the receiver, and half stays locked forever.

## What Hundi can't prevent

- It can't stop a double-spend. It proves one and charges for it.
- Someone who fools several people before anyone claims can still profit.
- A receiver only gets paid if the deposit hasn't run out.
- Keys are free, so a double-spender can start again with a new key. Losing the deposit is the only penalty.
