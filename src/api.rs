use axum::Json;
use serde::{Deserialize, Serialize};

use crate::compiler;
use crate::ir::IrType;

#[derive(Deserialize)]
pub struct CompileRequest {
    pub source: String,
    pub ir_type: IrType,
}

#[derive(Serialize)]
pub struct CompileResponse {
    pub success: bool,
    pub ir_output: String,
    pub messages: String,
}

pub async fn compile(Json(req): Json<CompileRequest>) -> Json<CompileResponse> {
    let result = tokio::task::spawn_blocking(move || {
        compiler::compile(&req.source, &req.ir_type)
    })
    .await
    .unwrap();

    Json(CompileResponse {
        success: result.success,
        ir_output: result.ir_output,
        messages: result.messages,
    })
}
