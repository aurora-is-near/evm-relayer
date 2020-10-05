const express = require('express');
const cors = require('cors');
const { NearProvider } = require('near-web3-provider');
const { add_wasm_by_example_to_string } = require('./rust/pkg/near_relayer_utils');
const nearAPI = require('near-api-js');
const { ecrecover, isValidSignature, pubToAddress, bufferToHex } = require('ethereumjs-util');
const { signHash } = require('./eip-712-helpers');

const app = express();
const port = 3000;

let bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const runWasm = async () => {
  // Call our exported function
  const helloString = add_wasm_by_example_to_string("Hello from ");

  // Log the result to the console
  console.log(helloString);
};
runWasm();

// TODO: after confirming it's working on testnet, move to GCP node
// http://34.82.212.1:3030
const NEAR_LOCAL_ACCOUNT_ID = 'evm.demo.testnet';
const NEAR_LOCAL_NETWORK_ID = 'default';
const NEAR_LOCAL_URL = 'https://rpc.testnet.near.org';
const NEAR_EXPLORER_URL = 'https://explorer.testnet.near.org';
const NEAR_LOCAL_EVM = 'evm.demo.testnet';

function NearTestNetProvider(keyStore) {
  return new NearProvider({
    nodeUrl: NEAR_LOCAL_URL,
    keyStore,
    networkId: NEAR_LOCAL_NETWORK_ID,
    masterAccountId: NEAR_LOCAL_ACCOUNT_ID,
    evmAccountId: NEAR_LOCAL_EVM,
  });
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

app.get('/', (req, res) => {
  // console.log('req', req);
  // console.log('res', res);
  console.log('get req.body', req.body);
  res.send('aloha honua');
})

app.post('/', (req, res) => {
  console.log('req.body', req.body);

  // get caller
  const typedData = req.body.data;
  if (!isJson(typedData)) {
    throw new Error('POST body\'s data is not valid JSON');
  }
  const jsonTypedData = JSON.parse(typedData);
  console.log('jsonTypedData', jsonTypedData);
  const hash = signHash(jsonTypedData);
  console.log('hash', hash);
  console.log('signature', req.body.signature);
  const sig = {
    v: req.body.signature.v,
    r: Buffer.from(req.body.signature.r.substr(2), 'hex'),
    s: Buffer.from(req.body.signature.s.substr(2), 'hex')
  }
  if (!isValidSignature(sig.v, sig.r, sig.s)) {
    throw new Error('Received invalid signature.');
  }
  const publicKey = ecrecover(hash, sig.v, sig.r, sig.s);
  const addrBuf = pubToAddress(publicKey);
  const addr = bufferToHex(addrBuf);
  console.log('addr', addr);

  // meta_call or whatever it's called
  res.send('Got a POST request')
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
})
