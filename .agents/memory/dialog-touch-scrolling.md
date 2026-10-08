---
name: Dialog touch scrolling
description: Keep nested permission lists within the modal's DOM scroll-lock boundary.
---

For long permission selectors inside modal dialogs, prefer an inline expandable list within the dialog rather than a body-portaled popover.

**Why:** The user reported that the page-permission selector would not scroll on iPad. A body-portaled list lies outside the parent modal's scroll-lock boundary; adding overflow and touch CSS alone does not resolve that interaction.

**How to apply:** Keep the modal's accessibility and scroll lock intact, bound the nested list's height, and provide its own vertical scrolling. Do not globally disable modal behavior for forms. Tablet-sized browser checks passed after this approach; physical iPad/Safari behavior was not directly tested.
