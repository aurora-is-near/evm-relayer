# Relayer for NEAR EVM

This repository is for a simple web server that will take incoming requests
that are signed using [EIP-712](https://eips.ethereum.org/EIPS/eip-712) and
route them properly to the NEAR EVM.

To use, first [build and install](https://github.com/near/evm-relayer/tree/master/rust)
the required Rust utilities, and then execute:

```bash
npm install
node index.js
```
