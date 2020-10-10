import express from 'express';
import cors from 'cors';
import nearWeb3Provider from 'near-web3-provider';
const { utils } = nearWeb3Provider;
import * as nearAPI from 'near-api-js';
import { Near, Signer } from 'near-api-js';
import {InMemoryKeyStore, KeyStore} from "near-api-js/lib/key_stores";
import { ecrecover, isValidSignature, pubToAddress, bufferToHex } from 'ethereumjs-util';
import { EIP712SignedData } from './eip-712-helpers';
import bodyParser from 'body-parser';
// For demonstration purposes
import { add_wasm_by_example_to_string } from '../rust/pkg/near_relayer_utils';

// Basic Express JS setup with body parsing
const app = express();
const port = 3000;
app.use(cors())
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// For demonstration purposes
const runWasm = async () => {
  const helloString = add_wasm_by_example_to_string("Hello from ");
  console.log(helloString);
};
runWasm();

const NEAR_LOCAL_ACCOUNT_ID = 'relayer.test.near';
const NEAR_LOCAL_NETWORK_ID = 'default';
const NEAR_LOCAL_URL = 'http://34.82.212.1:3030';
const NEAR_EXPLORER_URL = 'https://explorer.testnet.near.org';
const NEAR_LOCAL_EVM = 'evm';

class NearObjects {
  keyStore: InMemoryKeyStore;
  near: nearAPI.Near;
  nearAccount: nearAPI.Account;

  private static instance: NearObjects;

  private constructor() {}

  static getInstance() {
    if (!NearObjects.instance) {
      NearObjects.instance = new NearObjects();
    }
    return NearObjects.instance;
  }
}

const getNearObject = (): NearObjects => {
  return NearObjects.getInstance();
}
const nearObjects = getNearObject();

// let keyStore: InMemoryKeyStore;
// let near: nearAPI.Near;
// let nearAccount: nearAPI.Account;

type NearConfig = {
  keyStore?: KeyStore,
  signer?: Signer,
  deps?: { keyStore: KeyStore }
  helperUrl?: string
  initialBalance?: string
  masterAccount?: string
  networkId: string
  walletUrl: string
  explorerUrl: string
  nodeUrl: string
  contractName: string
}

const nearConfig: NearConfig = {
  networkId: NEAR_LOCAL_NETWORK_ID,
  nodeUrl: NEAR_LOCAL_URL,
  contractName: NEAR_LOCAL_ACCOUNT_ID,
  walletUrl: '',
  helperUrl: '',
  explorerUrl: NEAR_EXPLORER_URL
};

// keystore, TODO: look at BrowserLocalStorage
const createNearKeystoreObj = async (): Promise<InMemoryKeyStore> => {
  const privateKey = '5oN3D5kCwCwFjeGGQesEmBeR12puYxrYP12yBsEm8sdNsjaogXk9aKrUWrDBxyvaNNj75ySRd6c3GXT8nyY33CSo';
  const ks = new nearAPI.keyStores.InMemoryKeyStore();
  const keyPair = nearAPI.KeyPair.fromString(privateKey)
  await ks.setKey('default', 'relayer.test.near', keyPair);
  return ks;
}
const getNearKeyStore = async (): Promise<InMemoryKeyStore> => {
  return nearObjects.keyStore || await createNearKeystoreObj();
}

// near
const createNearObj = async (): Promise<Near> => {
  nearConfig.keyStore = await getNearKeyStore();
  return await nearAPI.connect(nearConfig);
}
const getNear = async () => {
  return nearObjects.near || await createNearObj();
}

// account
const createNearAccountObj = async () => {
  const n = await getNear();
  if (n) {
    return await n.account(NEAR_LOCAL_ACCOUNT_ID);
  } else {
    console.error('Could not get NEAR object'); // need this?
  }
}
const getNearAccount = async () => {
  return nearObjects.nearAccount || await createNearAccountObj();
}

const isJson = (str: string): boolean => {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

// TODO: put in a routing file
app.post('/', async (req, res) => {
  console.log('req.body', req.body);

  // get caller
  const typedData = req.body.data;
  if (!isJson(typedData)) {
    throw new Error('POST body\'s data is not valid JSON');
  }
  const jsonTypedData = JSON.parse(typedData);
  console.log('jsonTypedData', jsonTypedData);
  const helper = new EIP712SignedData();
  const hash = helper.signHash(jsonTypedData);
  const signature = {
    v: req.body.signature.v,
    r: Buffer.from(req.body.signature.r.substr(2), 'hex'),
    s: Buffer.from(req.body.signature.s.substr(2), 'hex')
  }
  console.log('signature', signature);
  if (!isValidSignature(signature.v, signature.r, signature.s)) {
    res.status(400).send('Received invalid signature');
    return;
  }
  const publicKey = ecrecover(hash, signature.v, signature.r, signature.s);
  const addrBuf = pubToAddress(publicKey);
  const recoveredAddress = bufferToHex(addrBuf);
  console.log('recovered Ethereum address', recoveredAddress);

  const account = await getNearAccount();
  console.log(`Current NEAR account ${account.accountId} becomes…`);
  const accountEvmAddress = utils.nearAccountToEvmAddress(account.accountId);
  console.log('accountEvmAddress', accountEvmAddress);

  // Why doesn't this work?
  // console.log('Getting nonce for that account…');

  // hardcoded for counter.test.near
  // we can try doing super simple calls/view like "increment" and "get_num" respectively
  // const counterEvmAddress = '0xe45c4034a989e1a4ce9207e312f71e783e019eb9';
  // const counterAddressArg = Buffer.from(counterEvmAddress.substr(2), 'hex');

  // remove the '0x' and hex encode
  // account's evm address turned into expected 20 bytes
  // See "AddressArg" in nearcore/runtime/near-evm-runner/src/lib.rs
  // const addressArg = Buffer.from(accountEvmAddress.substr(2), 'hex');

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

  // try {
  //   let nonceResult = await account.viewFunction(
  //     NEAR_LOCAL_EVM,
  //     'get_nonce',
  //     {
  //       args: [228, 92, 64, 52, 169, 137, 225, 164, 206, 146, 7, 227, 18, 247, 30, 120, 62, 1, 158, 185]
  //     },
  //   );
  //   console.log('nonceResult', nonceResult);
  // } catch (e) {
  //   console.error(e.message);
  //   throw e;
  // }

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
