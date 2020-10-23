import express from 'express';
import cors from 'cors';
import nearWeb3Provider from 'near-web3-provider';
// import utils from 'near-web3-provider/src/utils';
import BN from 'bn.js';
const { utils } = nearWeb3Provider;
import * as nearAPI from 'near-api-js';
import { Near, Signer } from 'near-api-js';
import {InMemoryKeyStore, KeyStore} from "near-api-js/lib/key_stores";
import { FinalExecutionOutcome, FinalExecutionStatusBasic } from "near-api-js/lib/providers";
import { isValidSignature, ecrecover } from 'ethereumjs-util';
import { recoverTypedSignature_v4, recoverTypedMessage } from 'eth-sig-util';
import bodyParser from 'body-parser';
// For demonstration purposes
import { add_wasm_by_example_to_string, sign } from '../rust/pkg/near_relayer_utils';
import * as RLP from 'rlp';
// import { EIP712SignedData } from './eip-712-helpers';

// Basic Express JS setup with body parsing
const app = express();
const port = 3000;
app.use(cors())
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// For demonstration purposes
const runWasmSign = async (json: string) => {
  // const helloString = add_wasm_by_example_to_string("Hello from ");
  // console.log(helloString);
  // const signResult = sign(json);
  // console.log('signResult', signResult);
};

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

type ParsedSignature = {
  r: string
  s: string
  v: number
}

const parseSignature = (signature: string): ParsedSignature => {
  return {
    r: signature.substring(0, 64),
    s: signature.substring(64, 128),
    v: parseInt(signature.substring(128, 130), 16)
  }
}

// TODO: put in a routing file
app.post('/', async (req, res) => {
  console.log('req.body', req.body);

  // get caller
  const typedData = req.body.data;
  if (!isJson(typedData)) {
    throw new Error('POST body\'s data is not valid JSON');
  }

  // await runWasmSign(typedData);

  const jsonTypedData = JSON.parse(typedData);
  console.log('jsonTypedData', jsonTypedData);
  const signature = req.body.signature;
  console.log('signature', signature);
  const parsedSignature = parseSignature(signature);
  console.log('parsedSignature', parsedSignature);
  if (!isValidSignature(parsedSignature.v, Buffer.from(parsedSignature.r, 'hex'), Buffer.from(parsedSignature.s, 'hex'))) {
    console.log(`Received invalid signature: ${signature}`);
    res.status(400).send('Received invalid signature');
    return;
  }

  const account = await getNearAccount();
  console.log(`Current NEAR account ${account.accountId} becomes…`);
  const accountEvmAddress = utils.nearAccountToEvmAddress(account.accountId);
  console.log('accountEvmAddress', accountEvmAddress);

  // eth-sig-util
  const recoveredAddress = recoverTypedSignature_v4({
    data: jsonTypedData,
    sig: `0x${signature}`
  });

  // const eip = new EIP712SignedData();
  // const eipResult = eip.signHash(jsonTypedData);
  // console.log('eipResult', eipResult);
  // const parSig = parseSignature(signature);
  // console.log('parSig', parSig);
  // const ecrec = ecrecover(eipResult, parSig.v, Buffer.from(parSig.r, 'hex'), Buffer.from(parSig.s, 'hex'));
  // console.log('ecrec', ecrec);

  // Function Call
  // let outcome: FinalExecutionOutcome;
  // try {
  //   const zeroVal = new BN(0);
  //   const data = [
  //     [
  //       'my_num_param',
  //       '19'
  //     ]
  //   ];
  //   const rlpData = RLP.encode(data);
  //   outcome = await utils.rawFunctionCall(
  //       account,
  //       jsonTypedData.message.evmId,
  //       'meta_call',
  //       utils.encodeCallArgs(jsonTypedData.message.contractAddress.toLowerCase(), rlpData),
  //       new BN('300000000000000'),
  //       zeroVal
  //   );
  //   console.log('outcome', outcome);
  // } catch (error) {
  //   console.log('aloha nwp error', error);
  //   if (error.type === 'FunctionCallError') {
  //     if (error.kind.EvmError.Revert) {
  //       const message = utils.hexToString(error.kind.EvmError.Revert);
  //       throw Error(`revert ${message}`);
  //     }
  //   }
  //   throw Error(`Unknown error: ${JSON.stringify(error)}`);
  // }

  res.sendStatus(200);
})

app.listen(port, () => {
  console.log(`NEAR EVM relay started at http://localhost:${port}`);
})
