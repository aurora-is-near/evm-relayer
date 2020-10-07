const express = require('express');
const cors = require('cors');
const { NearProvider, utils } = require('near-web3-provider');
const nearAPI = require('near-api-js');
const { ecrecover, isValidSignature, pubToAddress, bufferToHex } = require('ethereumjs-util');
const { signHash } = require('./eip-712-helpers');
const web3 = require('web3');
// demonstration of using compiled wasm
const { add_wasm_by_example_to_string } = require('./rust/pkg/near_relayer_utils');

const app = express();
const port = 3000;

let bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// demonstration of using compiled wasm
const runWasm = async () => {
  const helloString = add_wasm_by_example_to_string("Hello from ");
  console.log(helloString);
};
runWasm();

const NEAR_LOCAL_ACCOUNT_ID = 'relayer.test.near';
const NEAR_LOCAL_NETWORK_ID = 'default';
const NEAR_LOCAL_URL = 'http://34.82.212.1:3030';
// const NEAR_EXPLORER_URL = 'https://explorer.testnet.near.org';
const NEAR_LOCAL_EVM = 'evm';

const nearConfig = {
  networkId: NEAR_LOCAL_NETWORK_ID,
  nodeUrl: NEAR_LOCAL_URL,
  contractName: NEAR_LOCAL_ACCOUNT_ID,
  walletUrl: '',
  helperUrl: ''
};

let keyStore;
let near;
let nearAccount;

// keystore
const createNearKeystoreObj = async () => {
  let privateKey = '5oN3D5kCwCwFjeGGQesEmBeR12puYxrYP12yBsEm8sdNsjaogXk9aKrUWrDBxyvaNNj75ySRd6c3GXT8nyY33CSo';
  const ks = new nearAPI.keyStores.InMemoryKeyStore();
  const keyPair = nearAPI.KeyPair.fromString(privateKey)
  await ks.setKey('default', 'relayer.test.near', keyPair);
  return ks;
}
const getNearKeyStore = async () => {
  return keyStore || await createNearKeystoreObj();
}

// near
const createNearObj = async () => {
  const ks = await getNearKeyStore();
  // TODO: probably remove deps here
  return await nearAPI.connect(Object.assign({ deps: { ks }, keyStore: ks }, nearConfig))
}
const getNear = async () => {
  return near || await createNearObj();
}

// account
const createNearAccountObj = async () => {
  const n = await getNear();
  if (n) {
    const acct = await n.account(NEAR_LOCAL_ACCOUNT_ID);
    return acct;
  } else {
    console.error('Could not get NEAR object'); // need this?
  }
}
const getNearAccount = async () => {
  return nearAccount || await createNearAccountObj();
}

function isJson(str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

app.use(cors())

app.post('/', async function(req, res){
  console.log('req.body', req.body);

  // get caller
  const typedData = req.body.data;
  if (!isJson(typedData)) {
    throw new Error('POST body\'s data is not valid JSON');
  }
  const jsonTypedData = JSON.parse(typedData);
  console.log('jsonTypedData', jsonTypedData);
  const hash = signHash(jsonTypedData);
  const signature = {
    v: req.body.signature.v,
    r: Buffer.from(req.body.signature.r.substr(2), 'hex'),
    s: Buffer.from(req.body.signature.s.substr(2), 'hex')
  }
  console.log('signature', signature);
  if (!isValidSignature(signature.v, signature.r, signature.s)) {
    throw new Error('Received invalid signature.');
  }
  const publicKey = ecrecover(hash, signature.v, signature.r, signature.s);
  const addrBuf = pubToAddress(publicKey);
  const recoveredAddress = bufferToHex(addrBuf);
  console.log('recovered Ethereum address', recoveredAddress);

  const account = await getNearAccount();
  console.log(`Current NEAR account ${account} becomes…`);
  const accountEvmAddress = utils.nearAccountToEvmAddress(account.accountId);
  console.log('accountEvmAddress', accountEvmAddress);

  console.log('Getting nonce for that account…');
  // Why doesn't this work?

  // hardcoded for counter.test.near
  // we can try doing super simple calls/view like "increment" and "get_num" respectively
  const counterEvmAddress = '0xe45c4034a989e1a4ce9207e312f71e783e019eb9';
  const counterAddressArg = Buffer.from(counterEvmAddress.substr(2), 'hex');

  // remove the '0x' and hex encode
  // account's evm address turned into expected 20 bytes
  // See "AddressArg" in nearcore/runtime/near-evm-runner/src/lib.rs
  const addressArg = Buffer.from(accountEvmAddress.substr(2), 'hex');

  // In another Rust project Borsh serialized this:
  /*
  ViewCallArgs{
      sender: [60, 58, 79, 182, 43, 188, 16, 177, 146, 235, 112, 195, 121, 111, 0, 161, 24, 150, 86, 28],
      address: [60, 58, 79, 182, 43, 188, 16, 177, 146, 235, 112, 195, 121, 111, 0, 161, 24, 150, 86, 28],
      amount: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      args: vec![],
  };
   */
  // where the arrays are a mixture of using Node repl and dtool's h2a
  // I honestly think we may need to include Borsh macros in the nearcore repo?

  try {
    let nonceResult = await account.viewFunction(
      NEAR_LOCAL_EVM,
      'get_nonce',
      {
        args: [60, 58, 79, 182, 43, 188, 16, 177, 146, 235, 112, 195, 121, 111, 0, 161, 24, 150, 86, 28, 60, 58, 79, 182, 43, 188, 16, 177, 146, 235, 112, 195, 121, 111, 0, 161, 24, 150, 86, 28, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      },
    );
    console.log('nonceResult', nonceResult);
  } catch (e) {
    console.error(e.message);
    throw e;
  }

  // Figure out RLP encoded thing or whatever is needed, bytes-wise
  // in nearcore/runtime/near-evm-runner/src/lib.rs ("evm-precompile" branch)

  // await account.functionCall(
  //   NEAR_LOCAL_EVM,
  //   'meta_call_function', // or just "meta_call"?
  //   {
  //     symbol: tokenSearch,
  //     spec_id: "ZDJjOWY5MjE4N2YyNGVjMDk1N2NmNTAyMGMwN2FmZGE="
  //   },
  //   '300000000000000'
  // )

  res.sendStatus(200);
})

app.listen(port, () => {
  console.log(`NEAR EVM relay started at http://localhost:${port}`);
})
