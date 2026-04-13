# Agentic Coding Guidelines for CARLA Web

This document defines the rules and patterns for AI-assisted (agentic) coding workflows applied to the CARLA Web project. These guidelines ensure consistent, high-quality, and predictable behavior from coding agents.

---

## 1. Agentic Eagerness Control

Agentic scaffolds span a spectrum from fully autonomous to tightly controlled. The CARLA Web project uses a balanced approach.

### Default Behavior
- Agents should be **proactive but not reckless**.
- For routine code changes (styling, component creation, refactoring): act autonomously.
- For destructive actions (file deletion, database changes, force-push): always confirm with the user.

### Reducing Eagerness (for focused tasks)
When a task is small and well-defined:
- Limit context gathering to a maximum of 2-3 tool calls.
- Bias towards providing a correct answer quickly, even if it might not be fully comprehensive.
- If more investigation is needed, update the user with findings and open questions first.

### Increasing Eagerness (for complex tasks)
When a task is large or ambiguous:
- Keep going until the query is completely resolved.
- Never stop or hand back to the user when encountering uncertainty.
- Decide on the most reasonable assumption, proceed with it, and document it.
- Research or deduce the approach rather than asking for clarification.

---

## 2. Tool Calling Best Practices

### General Rules
- Use dedicated tools over shell commands when available (e.g., Read over `cat`, Grep over `grep`).
- Parallelize independent tool calls in a single response for efficiency.
- Sequential calls only when there are data dependencies between them.

### File Operations
| Action | Preferred Tool | Avoid |
|--------|---------------|-------|
| Read files | Read tool | `cat`, `head`, `tail` |
| Edit files | Edit tool | `sed`, `awk` |
| Create files | Write tool | `echo >`, heredoc |
| Search by name | Glob tool | `find`, `ls` |
| Search content | Grep tool | `grep`, `rg` |

### Tool Call Budgets by Task Type

| Task Type | Max Tool Calls | Notes |
|-----------|---------------|-------|
| Simple bug fix | 3-5 | Read file, understand, fix |
| New component | 5-10 | Check patterns, create, verify |
| Multi-file refactor | 10-20 | Search, plan, execute, verify |
| Feature implementation | 15-30 | Research, plan, implement, test |

---

## 3. Code Editing Workflow

### Before Editing
1. **Read the file** you intend to modify (mandatory).
2. **Understand the context**: read neighboring files, imports, and types.
3. **Check patterns**: look at similar components/files for established conventions.

### During Editing
1. **Make minimal changes**: only modify what's necessary for the task.
2. **Preserve style**: match indentation, naming conventions, and import ordering.
3. **Use Edit tool**: prefer targeted edits over full file rewrites.
4. **One concern per edit**: don't mix formatting changes with logic changes.

### After Editing
1. **Verify**: run relevant tests or type checks.
2. **Review**: check `git diff` to ensure changes are clean.
3. **Clean up**: remove scratch files and unnecessary comments.

---

## 4. Error Handling Strategy

### At System Boundaries (DO handle)
- User input validation
- WebSocket connection errors
- API response parsing
- File upload validation
- Authentication/authorization checks

### Internal Code (DON'T over-handle)
- Trust TypeScript's type system
- Trust framework guarantees (React, Vite)
- Don't add try/catch around code that can't throw
- Don't validate props that TypeScript already validates

---

## 5. Reasoning Effort Levels

Match the reasoning effort to task complexity:

| Level | Use Case | Behavior |
|-------|----------|----------|
| Minimal | Simple lookups, formatting, typo fixes | Fast response, minimal exploration |
| Low | Single-file changes, clear bug fixes | Brief planning, focused execution |
| Medium | Multi-file changes, new components | Structured plan, thorough execution |
| High | Architecture decisions, complex features | Deep analysis, comprehensive plan, iterative refinement |

### Minimal Reasoning Tips
When using minimal reasoning for fast iteration:
1. Provide a brief explanation summarizing thought process at the start.
2. Request thorough tool-calling preambles for progress tracking.
3. Disambiguate tool instructions as much as possible.
4. Include agentic persistence reminders to prevent premature termination.
5. Use prompted planning since there are fewer reasoning tokens for internal planning.

---

## 6. Self-Reflection Pattern

For zero-to-one feature development, use the self-reflection pattern:

```
1. Think of a quality rubric (5-7 categories) for the deliverable.
2. Categories might include:
   - Correctness (does it work?)
   - Code quality (readable, maintainable?)
   - Performance (meets budgets?)
   - Accessibility (keyboard, screen reader?)
   - Visual quality (consistent with design system?)
   - Error handling (graceful failures?)
   - Integration (works with existing code?)
3. Iterate on the solution until it scores highly across all categories.
4. If the solution doesn't hit top marks, start again.
```

---

## 7. Metaprompting for Problem Solving

When a prompt or approach isn't working, use metaprompting:

```
When optimizing an approach, consider:
- What specific changes could be made to more consistently achieve the desired behavior?
- What elements should be removed to prevent the undesired behavior?
- Keep as much of the existing approach intact as possible.
- Focus on minimal edits/additions that address the core issue.
```

---

## 8. Safety and Reversibility

### Safe Actions (proceed freely)
- Reading files
- Running tests
- Creating new files
- Editing existing files (with Read first)
- Running type checks
- Git status/diff/log

### Risky Actions (confirm first)
- Deleting files or branches
- Force-pushing
- Modifying CI/CD pipelines
- Changing database schemas
- Installing/removing dependencies
- Modifying shared configuration

### Investigation Before Destruction
- If encountering unexpected state (unfamiliar files, branches, config), investigate before deleting.
- Resolve merge conflicts rather than discarding changes.
- If a lock file exists, investigate what process holds it rather than deleting it.

---

## 9. Communication Standards

### Progress Updates
- Provide updates at natural milestones, not after every action.
- Lead with the answer or action, not the reasoning.
- Focus on: decisions needing input, high-level status, errors or blockers.

### Format
- Use Markdown only where semantically correct (code blocks, lists, tables).
- Use backticks for file, directory, function, and class names.
- Keep responses concise: if you can say it in one sentence, don't use three.

### When to Ask vs. When to Act
| Situation | Action |
|-----------|--------|
| Clear task, single interpretation | Act immediately |
| Ambiguous task, reasonable default exists | Act on default, document assumption |
| Ambiguous task, no clear default | Ask for clarification |
| Destructive or irreversible action | Always confirm |
| Multiple valid approaches with trade-offs | Present options briefly |
