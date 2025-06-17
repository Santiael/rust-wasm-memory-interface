const fs = require('fs');
const path = require('path');
const { TextEncoder, TextDecoder } = require('util');

const wasmFilePath = path.join(__dirname, 'target', 'wasm32v1-none', 'debug', 'rust_wasm_memory_interface.wasm');

const wasmBuffer = fs.readFileSync(wasmFilePath);

const NUMBER_BYTES = 8;
const BOOLEAN_BYTES = 1;

function toHex(number) {
  return `0x${number.toString(16)}`;
}

class Allocator {
  constructor(memory, allocateOnWasm, deallocateOnWasm) {
    this._memory = memory;
    this._allocateOnWasm = allocateOnWasm;
    this._deallocateOnWasm = deallocateOnWasm;

    this._textEncoder = new TextEncoder();

    this._allocateByType = {
      'number': (jsNumber) => {
        const pointer = this._allocateOnWasm(NUMBER_BYTES);

        const numberBuffer = new ArrayBuffer(NUMBER_BYTES);
        const arrayF64 = new Float64Array(numberBuffer);

        arrayF64.set([jsNumber], 0);

        const arrayU8 = new Uint8Array(numberBuffer);

        const memoryBuffer = new Uint8Array(this._memory.buffer);
        memoryBuffer.set(arrayU8, pointer);

        return { pointer, size: NUMBER_BYTES }
      },

      'boolean': (jsBoolean) => {
        const pointer = this._allocateOnWasm(BOOLEAN_BYTES);

        const memoryBuffer = new Uint8Array(this._memory.buffer);
        memoryBuffer.set([jsBoolean ? 1 : 0], pointer);

        return { pointer, size: BOOLEAN_BYTES };
      },

      'string': (jsString) => {
        const encodedString = this._textEncoder.encode(jsString);
        const stringSize = encodedString.length;

        const pointer = this._allocateOnWasm(stringSize);

        const memoryBuffer = new Uint8Array(this._memory.buffer);
        memoryBuffer.set(encodedString, pointer);

        return { pointer, size: stringSize };
      }
    }
  }

  setInMemory(value) {
    try {
      const ref = this._allocateByType[typeof value](value);
      console.log(`[js] {${value}} allocated on ${toHex(ref.pointer)}`);
      return ref;
    } catch (e) {
      console.error(`[js] failed to allocate: ${value}`);
      console.error(e);
    }
  }

  free({ pointer, size }) {
    try {
      this._deallocateOnWasm(pointer, size);
      console.log(`[js] deallocation of ${toHex(pointer)} succeded`)
    } catch (e) {
      console.error(`[js] failed to deallocate: ${toHex(pointer)}`);
      console.error(e);
    }
  }
}

function getWasmString(memory, stringInfoPointer) {
  const stringInfoView = new Uint32Array(memory.buffer, stringInfoPointer, 2);
  const stringPointer = stringInfoView[0];
  const stringLength = stringInfoView[1];

  const memoryU8View = new Uint8Array(memory.buffer);
  const stringBytes = memoryU8View.subarray(stringPointer, stringPointer + stringLength);
  const string = new TextDecoder('utf-8').decode(stringBytes);

  return [
    string,
    {
      pointer: stringPointer,
      size: stringLength
    }
  ];
}

async function App() {
  const { instance } = await WebAssembly.instantiate(wasmBuffer, {
    env: {
      print: (offset, length) => {
        const memory = instance.exports.memory;
        const memoryU8View = new Uint8Array(memory.buffer);
        const messageBytes = memoryU8View.subarray(offset, offset + length);
        const message = new TextDecoder('utf-8').decode(messageBytes);
        console.log(message);
      },
    }
  });

  const {
    memory,
    allocate,
    deallocate,
    read_bytes_from_memory,
    read_number_from_memory,
    STRING_INFO_BYTES,
    set_hello_on_memory
  } = instance.exports;

  const allocator = new Allocator(memory, allocate, deallocate);

  const numberRef = allocator.setInMemory(Number.MAX_VALUE);
  const booleanRef = allocator.setInMemory(true);
  const stringRef = allocator.setInMemory("Hello World! 🌎");

  read_bytes_from_memory(numberRef.pointer, numberRef.size);
  read_bytes_from_memory(booleanRef.pointer, booleanRef.size);
  read_bytes_from_memory(stringRef.pointer, stringRef.size);

  console.log(
    '[js] reading number from wasm memory:',
    read_number_from_memory(numberRef.pointer, numberRef.size)
  );

  allocator.free(numberRef);
  allocator.free(booleanRef);
  allocator.free(stringRef);

  const helloInfoPointer = set_hello_on_memory();

  const [value, helloStringRef] = getWasmString(memory, helloInfoPointer);

  console.log('[js] reading string allocated by wasm:', value);
  
  read_bytes_from_memory(helloStringRef.pointer, helloStringRef.size);

  allocator.free({ pointer: helloInfoPointer, size: STRING_INFO_BYTES });
  allocator.free(helloStringRef);
}

App();
