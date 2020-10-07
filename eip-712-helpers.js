// Taken largely from:
// https://github.com/ethereum/EIPs/blob/master/assets/eip-712/Example.js
// Thank you @PaulRBerg

const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');

// Recursively finds all the dependencies of a type
function dependencies(types, primaryType, found = []) {
    if (found.includes(primaryType)) {
        return found;
    }
    if (types[primaryType] === undefined) {
        return found;
    }
    found.push(primaryType);
    for (let field of types[primaryType]) {
        for (let dep of dependencies(field.type, found)) {
            if (!found.includes(dep)) {
                found.push(dep);
            }
        }
    }
    return found;
}

function encodeType(typedData, primaryType) {
    const types = typedData.types;
    // Get dependencies primary first, then alphabetical
    let deps = dependencies(types, primaryType);
    deps = deps.filter(t => t !== primaryType);
    deps = [primaryType].concat(deps.sort());

    // Format as a string with fields
    let result = '';
    for (let type of deps) {
        result += `${type}(${types[type].map(({ name, type }) => `${type} ${name}`).join(',')})`;
    }
    return result;
}

function typeHash(typedData, primaryType) {
    return ethUtil.keccak256(Buffer.from(encodeType(typedData, primaryType)));
}

function encodeData(typedData, primaryType, data) {
    const types = typedData.types;
    let encTypes = [];
    let encValues = [];

    // Add typehash
    encTypes.push('bytes32');
    encValues.push(typeHash(typedData, primaryType));

    // Add field contents
    for (let field of types[primaryType]) {
        let value = data[field.name];
        if (field.type === 'string' || field.type === 'bytes') {
            encTypes.push('bytes32');
            value = ethUtil.keccak256(Buffer.from(value));
            encValues.push(value);
        } else if (types[field.type] !== undefined) {
            encTypes.push('bytes32');
            value = ethUtil.keccak256(encodeData(typedData, field.type, value));
            encValues.push(value);
        } else if (field.type.lastIndexOf(']') === field.type.length - 1) {
            throw 'TODO: Arrays currently unimplemented in encodeData';
        } else {
            encTypes.push(field.type);
            encValues.push(value);
        }
    }

    return abi.rawEncode(encTypes, encValues);
}

function structHash(typedData, primaryType, data) {
    return ethUtil.keccak256(encodeData(typedData, primaryType, data));
}

const signHash = function(typedData) {
    /*
      bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01", DOMAIN_SEPARATOR,
            hash(req)
        ));
     */
    return ethUtil.keccak256(
        Buffer.concat([
            Buffer.from('1901', 'hex'),
            structHash(typedData, 'EIP712Domain', typedData.domain),
            structHash(typedData, typedData.primaryType, typedData.message),
        ]),
    );
};

module.exports = { signHash };
