export const markdownGuide = [
  'Card data.body (and update_content patch.body) supports GitHub-flavored Markdown: headings, paragraphs, emphasis, lists, tables, fenced code, images and links.',
  'Task-list syntax is - [ ] todo and - [x] done; Markdown checkboxes are display-only, changed by editing body. Use tasks cards for interactive shared tasks.',
  'Use [label](./docs/file.md), [video](./assets/clip.mp4), [image](./assets/picture.png) for inline file preview and annotations. Local relative paths resolve from the AgentCanvas workspace. Absolute paths and HTTP(S) direct links also work. Use <...> around a Markdown link destination containing spaces. ![alt](url) embeds an image. Ordinary web links open a web page.',
  'Mermaid diagrams render inside fenced code blocks labelled mermaid, in card/note/text bodies and Markdown file previews. Example body: ```mermaid\nflowchart LR\n  A[Idea] --> B[Review]\n```',
  'Mermaid source remains in body and can be edited through normal versioned content updates. Diagram errors show source and a retry/edit action. Rendering is local, uses strict security (no HTML/click callbacks), and is limited to 20,000 characters and 500 edges per diagram. Mermaid images do not create independently editable canvas nodes; use native diagram cards when those are needed.',
  'Keep Markdown as the actual body string, with real newline characters; do not wrap the entire document in a code fence. Raw HTML is not rendered. Preserve placements when editing text.',
].join(' ');
