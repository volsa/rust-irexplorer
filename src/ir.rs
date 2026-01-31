use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct IrType(String);

const VALID: &[&str] = &[
    "normal",
    "identified",
    "expanded",
    "expanded,identified",
    "expanded,hygiene",
    "ast-tree",
    "ast-tree,expanded",
    "hir",
    "hir,identified",
    "hir,typed",
    "hir-tree",
    "thir-tree",
    "thir-flat",
    "mir",
    "stable-mir",
    "mir-cfg",
];

impl IrType {
    pub fn rustc_flag(&self) -> &str {
        if VALID.contains(&self.0.as_str()) {
            &self.0
        } else {
            "hir"
        }
    }
}
