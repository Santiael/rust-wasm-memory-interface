#![no_std]

extern crate alloc;

use alloc::format;
use alloc::slice;
use alloc::string::String;
use alloc::vec::Vec;
use core::ffi::c_void;
use core::mem;
use core::panic::PanicInfo;

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

#[link(wasm_import_module = "env")]
unsafe extern "C" {
    fn print(ptr: *const u8, len: usize);
}

fn print_on_host(message: String) {
    unsafe {
        print(message.as_ptr(), message.len());
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn allocate(bytes_length: usize) -> *mut c_void {
    let buffer = Vec::with_capacity(bytes_length);
    let pointer = mem::ManuallyDrop::new(buffer).as_mut_ptr();

    pointer
}

#[unsafe(no_mangle)]
pub fn deallocate(pointer: *mut c_void, bytes_length: usize) {
    unsafe {
        let _ = Vec::from_raw_parts(pointer, bytes_length, bytes_length);
    }
}

#[unsafe(no_mangle)]
pub fn read_bytes_from_memory(pointer: *const u8, offset: usize) {
    let bytes = unsafe { slice::from_raw_parts(pointer, offset) };

    print_on_host(format!("[wasm] reading from {:?}", pointer));

    for byte in bytes {
        print_on_host(format!("[wasm] {}", byte));
    }
}

#[unsafe(no_mangle)]
pub fn read_number_from_memory(pointer: *const u8, bytes_length: usize) -> f64 {
    if bytes_length != 8 {
        print_on_host(format!(
            "[wasm] Error: Expected 8 bytes for f64, got {}",
            bytes_length
        ));

        return f64::NAN;
    }

    unsafe {
        let byte_slice = slice::from_raw_parts(pointer, bytes_length);

        let mut bytes_array = [0u8; 8];
        bytes_array.copy_from_slice(byte_slice);

        f64::from_ne_bytes(bytes_array)
    }
}

#[unsafe(no_mangle)]
pub static STRING_INFO_BYTES: usize = 8;

#[unsafe(no_mangle)]
pub fn set_hello_on_memory() -> *mut u32 {
    let binary_string = Vec::from(b"Hello from Wasm! \xF0\x9F\x92\x9C");
    let output_pointer = allocate(STRING_INFO_BYTES) as *mut u32;

    unsafe {
        *output_pointer.offset(0) = binary_string.as_ptr() as u32;
        *output_pointer.offset(1) = binary_string.len() as u32;
    }

    mem::forget(binary_string);

    output_pointer
}
