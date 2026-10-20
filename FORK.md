# Fork notes

Fork của [continuedev/continue](https://github.com/continuedev/continue), bổ sung engine autocomplete v2, next edit theo format Sweep, fast apply bằng model finetune, chạy coding agent bên ngoài qua ACP, và personas. File này ghi những gì khác upstream và cách cấu hình.

## Nhánh

| Ref | Ý nghĩa |
|---|---|
| `fork/main` | Nhánh chính của fork |
| `upstream` | `continuedev/continue`. Fork tách ra tại `5522c6f44` (20/07/2026) |

Cập nhật upstream:

```bash
git fetch upstream
git rebase upstream/main fork/main
```

## Thay đổi so với upstream

| Phần | File chính |
|---|---|
| Engine autocomplete v2: debounce, cache khi người dùng gõ tiếp đúng theo gợi ý (key theo prefix), prefetch gợi ý kế tiếp. Prompt dựng bằng `renderPromptWithTokenLimit` của upstream. Khi next edit đang bật, mọi lời gọi được chuyển cho `ContinueCompletionProvider` | `core/autocompletion-v2/`, `extensions/vscode/src/autocomplete-v2/` |
| Signature help (LSP) trong context autocomplete (`experimental_enableSignatureHelp`) | `core/autocomplete/context/ContextRetrievalService.ts` |
| Tùy chọn `experimental_prefetch`, `reasoningEffort` | `core/index.d.ts`, `packages/config-yaml/src/schemas/models.ts` |
| Next edit theo format Sweep cho `sweep-next-edit` và `next-edit-ft` | `core/nextEdit/templating/sweep.ts`, `core/nextEdit/providers/SweepNextEditProvider.ts` |
| Fast apply bằng model finetune (`fast-apply-ft`) cho role `apply` | `core/edit/lazy/fastApply.ts` |
| Cập nhật VSIX từ server tự host (`continue.intranetUpdateServerUrl`) | `extensions/vscode/src/services/IntranetUpdateService.ts` |
| Lệnh `Benchmark Autocomplete v2 provider` / `Benchmark Continue Autocomplete provider` | `extensions/vscode/src/commands.ts` |
| Chạy coding agent bên ngoài (OpenCode, Gemini CLI, Qwen Code…) làm "não" của phiên chat qua Agent Client Protocol | `core/acp/`, `gui/src/components/dialogs/NewSessionDialog.tsx`, `BrainModeSelect.tsx` |
| Personas: vai trò, hướng dẫn và danh sách tool được chèn vào system message của LLM | `gui/src/pages/config/sections/PersonaSection.tsx`, `gui/src/components/personaSelection/` |
| Tool `get_file_diagnostics` (lỗi của file từ IDE) và `call_mcp_tool_with_file` (đọc file rồi truyền nội dung cho một tool MCP) | `core/tools/definitions/` |
| Tùy chọn "Auto (High Risk)": tự duyệt cả lệnh terminal bị đánh giá là nguy hiểm | `gui/src/redux/thunks/evaluateToolPolicies.ts` |

Format prompt của next edit và fast apply phải giống từng byte với format dùng lúc train model. `sweep.vitest.ts` và `fastApply.vitest.ts` giữ cố định format này.

## Cấu hình model

Các ví dụ `~/.continue/config.yaml` dưới đây giả định model được serve bằng vLLM.

### Autocomplete v2

```yaml
models:
  - name: Autocomplete
    provider: vllm
    model: Qwen/Qwen2.5-Coder-3B
    apiBase: http://localhost:8000/v1
    roles: [autocomplete]
    autocompleteOptions:
      debounceDelay: 150
      experimental_enableSignatureHelp: true
      experimental_prefetch: true
```

### Next edit

Next edit dùng chung slot model `autocomplete`. Nó chạy khi tên model có chứa `sweep-next-edit` hoặc `next-edit-ft`, và setting `continue.enableNextEdit` đang bật. Với các model khác, extension dùng autocomplete v2.

```bash
vllm serve sweepai/sweep-next-edit-1.5B --served-model-name sweep-next-edit-1.5B --port 8001
```

```yaml
models:
  - name: Next Edit
    provider: vllm
    model: sweep-next-edit-1.5B
    apiBase: http://localhost:8001/v1
    roles: [autocomplete]
```

Provider gửi prompt thô tới `/v1/completions` với stop token `<|file_sep|>`, và model viết lại cửa sổ ±10 dòng quanh con trỏ. Model finetune cùng format thì serve với tên chứa `next-edit-ft`.

### Fast apply

Model có role `apply` mà tên chứa `fast-apply-ft` sẽ đi theo luồng fast apply. Luồng này chạy sau apply tất định bằng AST và sau unified diff. Nếu lỗi, nó rơi về luồng apply mặc định.

```bash
vllm serve ./fast-apply-ft-1.5b --served-model-name fast-apply-ft-1.5b --port 8002 \
  --speculative-config '{"method": "ngram", "num_speculative_tokens": 8, "prompt_lookup_max": 4}'
```

```yaml
models:
  - name: Fast Apply
    provider: vllm
    model: fast-apply-ft-1.5b
    apiBase: http://localhost:8002/v1
    roles: [apply]
```

### Agent bên ngoài (ACP)

```yaml
agent_servers:
  - name: OpenCode
    provider: opencode          # có sẵn lệnh mặc định: opencode acp
  - name: Gemini CLI
    provider: gemini            # gemini --experimental-acp
  - name: My Agent
    provider: custom
    command: my-agent
    args: ["--acp"]
    env: { MY_AGENT_TOKEN: "..." }
    allowSelectModel: true      # cho phép chọn model của agent trong khung chat
```

Khi có `agent_servers`, lệnh New Session hỏi phiên mới do LLM hay agent nào điều khiển. Agent chạy trong thư mục gốc của workspace. Mỗi agent có một tiến trình, mỗi cuộc hội thoại có một session ACP. Agent ghi file thì thay đổi hiện dưới dạng diff để người dùng duyệt, và yêu cầu quyền (ví dụ chạy lệnh) hiện thành hộp thoại. Picker mode/model hiển thị mode và model do agent báo về. Personas không áp dụng cho phiên agent.

### Personas

Có sẵn các persona Code, Architect, Ask… Persona tự tạo được lưu trong `config.yaml`:

```yaml
personas:
  - id: reviewer
    name: Reviewer
    roleDefinition: You are a meticulous code reviewer.
    whenToUse: Review diffs for bugs, security issues and missing tests.
    availableTools: Read Files, Search Codebase
    customInstructions: Reply in Vietnamese.
  - name: Code                  # chỉ ghi đè customInstructions của persona có sẵn
    customInstructions: Prefer small, focused functions.
```

### Quyền của tool

- `call_mcp_tool_with_file` gọi được mọi tool MCP, kể cả tool ghi hoặc xóa, nên mặc định phải xin phép.
- "Auto (High Risk)" được bật riêng cho từng tool (hiện chỉ áp dụng cho `run_terminal_command`). Khi bật, các lệnh mà bộ kiểm tra bảo mật đánh dấu là nguy hiểm sẽ chạy không hỏi. Mặc định tắt.

## Build và kiểm tra

```bash
./scripts/install-dependencies.sh   # npm install: thêm @agentclientprotocol/sdk vào package-lock (commit lại lockfile)
(cd core && npm run tsc:check && npx vitest run nextEdit/templating/sweep.vitest.ts edit/lazy/fastApply.vitest.ts)
(cd extensions/vscode && npm run tsc:check && npm run package)
```

Kết quả mong đợi: không có lỗi type, test đều qua, và có file `extensions/vscode/build/continue-*.vsix`.

Kiểm tra thủ công trong IDE:
- **Autocomplete:** gợi ý có xuất hiện. Prompt trong log có chứa snippet từ file khác (comment dạng `// Path: ...`). Gõ tiếp đúng theo gợi ý thì gợi ý vẫn còn.
- **Next edit:** đổi tên một biến ở một chỗ, gợi ý đổi tên ở các chỗ khác hiện ra trong cửa sổ. Tab nhảy được tới chỗ sửa tiếp theo.
- **Apply:** bấm Apply trên một code block có `// ... existing code ...`, diff hiện ra ngay và không xóa nhầm code.

## @codebase

Upstream vẫn còn hạ tầng indexing (`core/indexing`), nhưng đã đánh dấu `@Codebase` là deprecated và chuyển sang để agent tự tìm kiếm trong code. Fork này không thay đổi phần đó.
