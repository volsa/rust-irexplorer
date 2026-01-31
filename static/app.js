const examples = {
    hello: `fn main() {
    let x = 42;
    let y = x + 1;
    println!("{y}");
}
`,
    desugar: `// for loops, ?, if let — desugared in HIR
fn find(data: &[i32], target: i32) -> Option<usize> {
    for (i, &val) in data.iter().enumerate() {
        if val == target {
            return Some(i);
        }
    }
    None
}

fn try_parse(s: &str) -> Result<i32, std::num::ParseIntError> {
    let n = s.trim().parse::<i32>()?;
    Ok(n * 2)
}

fn main() {
    let nums = [10, 20, 30];
    if let Some(i) = find(&nums, 20) {
        println!("found at {i}");
    }
    let _ = try_parse("21");
}
`,
    moves: `// Ownership, moves, and drop order — visible in MIR
fn main() {
    let a = String::from("hello");
    let b = a;  // move
    println!("{b}");

    let c = String::from("world");
    drop(c);  // explicit drop

    let d = vec![1, 2, 3];
    let e = d.clone();  // clone, no move
    println!("{d:?} {e:?}");
}  // drop order: e, d, b
`,
    borrowing: `// Borrows and references — MIR shows borrow regions
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}

fn push_and_read(v: &mut Vec<i32>) -> i32 {
    v.push(42);
    v[0]
}

fn main() {
    let s1 = String::from("long");
    let s2 = String::from("hi");
    let r = longest(&s1, &s2);
    println!("{r}");

    let mut v = vec![1, 2];
    let sum = push_and_read(&mut v);
    println!("{sum}");
}
`,
    matching: `// Pattern matching — THIR does exhaustiveness checking
enum Expr {
    Num(i32),
    Add(Box<Expr>, Box<Expr>),
    Neg(Box<Expr>),
}

fn eval(e: &Expr) -> i32 {
    match e {
        Expr::Num(n) => *n,
        Expr::Add(a, b) => eval(a) + eval(b),
        Expr::Neg(x) => -eval(x),
    }
}

fn main() {
    let expr = Expr::Add(
        Box::new(Expr::Num(1)),
        Box::new(Expr::Neg(Box::new(Expr::Num(2)))),
    );
    println!("{}", eval(&expr));
}
`,
    closures: `// Closures and captures — see how the compiler lifts them
fn apply<F: Fn(i32) -> i32>(f: F, x: i32) -> i32 {
    f(x)
}

fn main() {
    let offset = 10;
    let add = |x| x + offset;       // captures by ref
    let mut total = 0;
    let mut acc = |x: i32| {        // captures by mut ref
        total += x;
        total
    };

    println!("{}", apply(add, 5));
    acc(1);
    acc(2);
    println!("{total}");
}
`,
};

const defaultSource = examples.hello;

// Load Monaco Editor
require.config({
    paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs" },
});

const HLJS_THEMES = {
    dark: "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/vs2015.min.css",
    light: "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/vs.min.css",
};

function getTheme() {
    return localStorage.getItem("ir-explorer-theme") || "dark";
}

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.getElementById("hljs-theme").href = HLJS_THEMES[theme];
    document.getElementById("theme-toggle").textContent = theme === "dark" ? "\u263E" : "\u2600";
    localStorage.setItem("ir-explorer-theme", theme);
}

// Apply saved theme before Monaco loads
applyTheme(getTheme());

require(["vs/editor/editor.main"], function () {
    const currentTheme = getTheme();

    const editor = monaco.editor.create(document.getElementById("editor"), {
        value: defaultSource,
        language: "rust",
        theme: currentTheme === "dark" ? "vs-dark" : "vs",
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
        lineHeight: 1.5 * 13,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 8 },
    });

    const irOutput = document.getElementById("ir-output");
    const irLines = document.getElementById("ir-lines");
    const messages = document.getElementById("messages");
    const compileBtn = document.getElementById("compile-btn");
    const irButtons = document.querySelectorAll(".ir-btn");
    const exampleSelect = document.getElementById("example");
    const themeToggle = document.getElementById("theme-toggle");

    let irCache = {};
    let activeIr = "hir";
    let decorations = [];

    // --- Pane resize handles ---
    (function initResize() {
        const vHandle = document.getElementById("v-handle");
        const hHandle = document.getElementById("h-handle");
        const overlay = document.getElementById("drag-overlay");
        const editorPane = document.getElementById("editor-pane");
        const irPane = document.getElementById("ir-pane");
        const mainRow = document.getElementById("main-row");
        const messagesPane = document.getElementById("messages-pane");

        function setupDrag(handle, axis) {
            handle.addEventListener("mousedown", (e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startY = e.clientY;
                const dragClass = axis === "v" ? "dragging-v" : "dragging-h";
                document.body.classList.add(dragClass);

                let onMove;

                if (axis === "v") {
                    const editorW = editorPane.getBoundingClientRect().width;
                    const irW = irPane.getBoundingClientRect().width;

                    onMove = (e) => {
                        const dx = e.clientX - startX;
                        editorPane.style.flex = `${Math.max(100, editorW + dx)} 0 0px`;
                        irPane.style.flex = `${Math.max(100, irW - dx)} 0 0px`;
                    };
                } else {
                    const mainH = mainRow.getBoundingClientRect().height;
                    const msgH = messagesPane.getBoundingClientRect().height;

                    onMove = (e) => {
                        const dy = e.clientY - startY;
                        mainRow.style.flex = `${Math.max(100, mainH + dy)} 0 0px`;
                        messagesPane.style.height = `${Math.max(40, msgH - dy)}px`;
                    };
                }

                function onUp() {
                    document.body.classList.remove(dragClass);
                    overlay.removeEventListener("mousemove", onMove);
                    overlay.removeEventListener("mouseup", onUp);
                }

                overlay.addEventListener("mousemove", onMove);
                overlay.addEventListener("mouseup", onUp);
            });
        }

        setupDrag(vHandle, "v");
        setupDrag(hHandle, "h");
    })();

    compileBtn.addEventListener("click", compile);

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, function () {
        compile();
    });

    themeToggle.addEventListener("click", () => {
        const next = getTheme() === "dark" ? "light" : "dark";
        applyTheme(next);
        monaco.editor.setTheme(next === "dark" ? "vs-dark" : "vs");
        // Re-render IR output to update hljs highlighting
        if (irCache[activeIr]) {
            showIr(activeIr);
        }
    });

    irButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            activeIr = btn.dataset.ir;
            irButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            showIr(activeIr);
        });
    });

    exampleSelect.addEventListener("change", () => {
        const key = exampleSelect.value;
        if (key && examples[key]) {
            editor.setValue(examples[key]);
        }
        exampleSelect.value = "";
    });

    function reindent(text) {
        return text.replace(/^( +)/gm, (match) => {
            const level = Math.floor(match.length / 4);
            const remainder = match.length % 4;
            return "  ".repeat(level) + " ".repeat(remainder);
        });
    }

    // Parse span like "somefile.rs:3:5: 5:10 (#0)" or "somefile.rs:3:5"
    const SPAN_RE = /[^\s:]+\.rs:(\d+):(\d+)(?:: (\d+):(\d+))?/;

    function parseSpan(line) {
        const m = line.match(SPAN_RE);
        if (!m) return null;
        const startLine = parseInt(m[1]);
        const startCol = parseInt(m[2]);
        const endLine = m[3] ? parseInt(m[3]) : startLine;
        const endCol = m[4] ? parseInt(m[4]) : startCol;
        if (startLine === 0) return null;
        return { startLine, startCol, endLine, endCol };
    }

    // Compute the effective span for each line by propagating spans
    // to their enclosing { ... } blocks. Inner blocks override outer ones.
    function computeLineSpans(rawLines) {
        const n = rawLines.length;
        const lineSpans = new Array(n).fill(null);

        // Step 1: find direct spans on each line
        const directSpans = rawLines.map((l) => parseSpan(l));

        // Step 2: find block ranges using brace matching, and collect
        // spans that belong to each block. A "span:" field at some
        // indent belongs to the nearest enclosing block.
        // We use a stack-based approach: track open braces.
        const braceStack = []; // stack of { openLine }
        const blocks = []; // { openLine, closeLine, span }

        for (let i = 0; i < n; i++) {
            const line = rawLines[i];
            // Count braces (outside strings, roughly)
            for (const ch of line) {
                if (ch === "{") {
                    braceStack.push({ openLine: i, span: null });
                } else if (ch === "}" && braceStack.length) {
                    const block = braceStack.pop();
                    block.closeLine = i;
                    if (block.span) {
                        blocks.push(block);
                    }
                }
            }

            // If this line has a span, assign it to innermost open block
            if (directSpans[i] && braceStack.length) {
                braceStack[braceStack.length - 1].span = directSpans[i];
            }
        }

        // Step 3: assign spans to lines. Process blocks from largest to
        // smallest so inner blocks override outer ones.
        blocks.sort((a, b) => (b.closeLine - b.openLine) - (a.closeLine - a.openLine));
        for (const block of blocks) {
            for (let i = block.openLine; i <= block.closeLine; i++) {
                lineSpans[i] = block.span;
            }
        }

        // Step 4: lines with a direct span on them always use that span
        for (let i = 0; i < n; i++) {
            if (directSpans[i]) {
                lineSpans[i] = directSpans[i];
            }
        }

        return lineSpans;
    }

    // Palette of subtle background colors for source line highlighting
    const SPAN_COLORS = [
        "rgba(86, 156, 214, 0.12)",   // blue
        "rgba(78, 201, 176, 0.12)",   // teal
        "rgba(206, 145, 120, 0.12)",  // orange
        "rgba(197, 134, 192, 0.12)",  // purple
        "rgba(181, 206, 168, 0.12)",  // green
        "rgba(220, 220, 170, 0.12)",  // yellow
        "rgba(243, 139, 168, 0.12)",  // pink
        "rgba(137, 180, 250, 0.12)",  // light blue
        "rgba(249, 226, 175, 0.12)",  // peach
        "rgba(166, 227, 161, 0.12)",  // mint
        "rgba(245, 194, 231, 0.12)",  // mauve
        "rgba(148, 226, 213, 0.12)",  // sky
        "rgba(250, 179, 135, 0.12)",  // tangerine
        "rgba(203, 166, 247, 0.12)",  // lavender
        "rgba(116, 199, 236, 0.12)",  // sapphire
        "rgba(245, 224, 220, 0.12)",  // rosewater
        "rgba(242, 205, 205, 0.12)",  // flamingo
        "rgba(186, 194, 222, 0.12)",  // subtext
        "rgba(249, 249, 113, 0.12)",  // lemon
        "rgba(255, 154, 162, 0.12)",  // coral
        "rgba(130, 170, 255, 0.12)",  // periwinkle
        "rgba(170, 255, 195, 0.12)",  // seafoam
        "rgba(255, 183, 77, 0.12)",   // amber
        "rgba(186, 147, 214, 0.12)",  // wisteria
    ];

    // Map a span to a consistent color using all coordinates
    function colorForSpan(span) {
        const hash = span.startLine * 1000000 + span.startCol * 1000 + span.endLine * 100 + span.endCol;
        return SPAN_COLORS[hash % SPAN_COLORS.length];
    }

    function highlightSource(span) {
        if (!span) {
            decorations = editor.deltaDecorations(decorations, []);
            return;
        }
        decorations = editor.deltaDecorations(decorations, [{
            range: new monaco.Range(span.startLine, span.startCol, span.endLine, span.endCol),
            options: {
                className: "source-highlight",
                isWholeLine: span.startCol === 1 && span.endCol <= 1,
            },
        }]);
        editor.revealLineInCenterIfOutsideViewport(span.startLine);
    }

    function showIr(irType) {
        const entry = irCache[irType];
        if (!entry) {
            irOutput.textContent = "";
            irLines.textContent = "";
            messages.textContent = "";
            return;
        }
        const text = reindent(entry.ir_output || "(no output)");
        const rawLines = text.split("\n");
        const lineSpans = computeLineSpans(rawLines);

        // Highlight with hljs first, then split into hoverable lines
        const highlighted = hljs.highlight(text, { language: "rust", ignoreIllegals: true }).value;
        const htmlLines = splitHighlightedLines(highlighted);

        irOutput.innerHTML = "";
        htmlLines.forEach((html, i) => {
            const div = document.createElement("div");
            div.className = "ir-line";
            div.innerHTML = html || "\n";
            const span = lineSpans[i];
            if (span) {
                div.classList.add("has-span");
                div.style.backgroundColor = colorForSpan(span);
                div.addEventListener("mouseenter", () => highlightSource(span));
                div.addEventListener("mouseleave", () => highlightSource(null));
            }
            irOutput.appendChild(div);
        });

        const width = String(rawLines.length).length;
        irLines.textContent = Array.from({ length: rawLines.length }, (_, i) =>
            String(i + 1).padStart(width)
        ).join("\n");
        messages.textContent = entry.messages || "(no messages)";
    }

    // Split hljs highlighted HTML by newlines, preserving open spans across lines
    function splitHighlightedLines(html) {
        const lines = [];
        let current = "";
        let openTags = [];

        const parts = html.split("\n");
        for (let i = 0; i < parts.length; i++) {
            // Re-open any spans from previous line
            current = openTags.map((t) => t).join("") + parts[i];

            // Track open/close span tags
            const tagRe = /<\/?span[^>]*>/g;
            let m;
            while ((m = tagRe.exec(parts[i])) !== null) {
                if (m[0].startsWith("</")) {
                    openTags.pop();
                } else {
                    openTags.push(m[0]);
                }
            }

            // Close any still-open spans for this line
            current += "</span>".repeat(openTags.length);
            lines.push(current);
        }
        return lines;
    }

    async function compile() {
        const source = editor.getValue();

        compileBtn.disabled = true;
        compileBtn.textContent = "Compiling...";
        irOutput.textContent = "Compiling...";
        irLines.textContent = "";
        messages.textContent = "";
        irCache = {};

        irButtons.forEach((btn) => {
            btn.classList.remove("ready");
            btn.classList.add("loading");
        });

        const irTypes = Array.from(irButtons).map((btn) => btn.dataset.ir);

        const fetches = irTypes.map(async (ir_type) => {
            try {
                const resp = await fetch("/api/compile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ source, ir_type }),
                });
                const data = await resp.json();
                irCache[ir_type] = data;
            } catch (e) {
                irCache[ir_type] = { ir_output: "", messages: `Error: ${e.message}` };
            }
            const btn = document.querySelector(`.ir-btn[data-ir="${ir_type}"]`);
            if (btn) {
                btn.classList.remove("loading");
                btn.classList.add("ready");
            }
            if (ir_type === activeIr) {
                showIr(activeIr);
            }
        });

        await Promise.all(fetches);

        compileBtn.disabled = false;
        compileBtn.textContent = "Compile";
        showIr(activeIr);
    }
});
