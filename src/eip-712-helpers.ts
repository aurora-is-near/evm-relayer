// Taken largely from:
// https://github.com/ethereum/EIPs/blob/master/assets/eip-712/Example.js
// Thank you @PaulRBerg
import { keccak256} from 'ethereumjs-util';
import { rawEncode } from 'ethereumjs-abi';

type Pair = {
    name: string
    type: string
}

export class EIP712SignedData {

    // Recursively finds all the dependencies of a type
    dependencies = (types: any, primaryType: string, found: any = []) => {
        if (found.includes(primaryType)) {
            return found;
        }
        if (types[primaryType] === undefined) {
            return found;
        }
        found.push(primaryType);
        for (const field of types[primaryType]) {
            for (const dep of this.dependencies(field.type, found)) {
                if (!found.includes(dep)) {
                    found.push(dep);
                }
            }
        }
        return found;
    }

    encodeType = (typedData: any, primaryType: string): string => {
        const types = typedData.types;
        // Get dependencies primary first, then alphabetical
        let deps: any = this.dependencies(types, primaryType);
        deps = deps.filter((t: any) => t !== primaryType);
        deps = [primaryType].concat(deps.sort());

        // Format as a string with fields
        let result: string = '';
        for (const t of deps) {
            const type: any = types[t];
            const typeList = type.map((pair: Pair) => {
                return `${pair.type} ${pair.name}`;
            }).join(',');
            result += `${t}(${typeList})`;
        }
        console.log('result', result);
        return result;
    }

    typeHash = (typedData: any, primaryType: string): Buffer => {
        return keccak256(Buffer.from(this.encodeType(typedData, primaryType)));
    }

    encodeData = (typedData: any, primaryType: string, data: any): Buffer => {
        const types = typedData.types;
        const encTypes = [];
        const encValues = [];

        // Add typehash
        encTypes.push('bytes32');
        encValues.push(this.typeHash(typedData, primaryType));

        // Add field contents
        for (const field of types[primaryType]) {
            let value = data[field.name];
            if (field.type === 'string' || field.type === 'bytes') {
                encTypes.push('bytes32');
                value = keccak256(Buffer.from(value));
                encValues.push(value);
            } else if (types[field.type] !== undefined) {
                encTypes.push('bytes32');
                value = keccak256(this.encodeData(typedData, field.type, value));
                encValues.push(value);
            } else if (field.type.lastIndexOf(']') === field.type.length - 1) {
                throw new Error('TODO: Arrays currently unimplemented in encodeData');
            } else {
                encTypes.push(field.type);
                encValues.push(value);
            }
        }

        return rawEncode(encTypes, encValues);
    }

    // structHash(typedData: any, primaryType: string, data: string): Buffer {
    structHash = (typedData: any, primaryType: string, data: string): Buffer => {
        return keccak256(this.encodeData(typedData, primaryType, data));
    }

    signHash = (typedData: any): Buffer => {
        /*
          bytes32 digest = keccak256(abi.encodePacked(
                "\x19\x01", DOMAIN_SEPARATOR,
                hash(req)
            ));
         */
        const domain = this.structHash(typedData, 'EIP712Domain', typedData.domain);
        const message = this.structHash(typedData, typedData.primaryType, typedData.message);
        const digest = Buffer.concat([
            Buffer.from('1901', 'hex'),
            domain,
            message,
        ]);
        return keccak256(digest);
    };
}
