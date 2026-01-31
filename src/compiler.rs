use std::io::Write;
use std::process::Command;

use tempfile::Builder;

use crate::ir::IrType;

pub struct CompileResult {
    pub success: bool,
    pub ir_output: String,
    pub messages: String,
}

pub fn compile(source: &str, ir_type: &IrType) -> CompileResult {
    let tmp = match Builder::new().suffix(".rs").tempfile() {
        Ok(t) => t,
        Err(e) => {
            return CompileResult {
                success: false,
                ir_output: String::new(),
                messages: format!("Failed to create temp file: {e}"),
            };
        }
    };

    if let Err(e) = write!(tmp.as_file(), "{}", source) {
        return CompileResult {
            success: false,
            ir_output: String::new(),
            messages: format!("Failed to write source: {e}"),
        };
    }

    let flag = format!("-Zunpretty={}", ir_type.rustc_flag());

    let output = match Command::new("rustup")
        .args(["run", "nightly", "rustc", &flag, "--edition=2021", "--crate-name=input"])
        .arg(tmp.path())
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            return CompileResult {
                success: false,
                ir_output: String::new(),
                messages: format!("Failed to run rustc: {e}"),
            };
        }
    };

    CompileResult {
        success: output.status.success(),
        ir_output: String::from_utf8_lossy(&output.stdout).into_owned(),
        messages: String::from_utf8_lossy(&output.stderr).into_owned(),
    }
}
