---
name: Facebook sharing on iOS
description: Reliable browser-sharing behavior for Facebook destinations on iPhone and iPad.
---

For a generic iOS Web Share action intended to include Facebook, send the public URL and text but do not attach the image as a file. Keep the page's server-rendered Open Graph image accurate instead.

**Why:** iOS presents URL-plus-file payloads as “1 Link and 1 Image,” but Facebook may be excluded as an eligible destination. Facebook's web sharer can also open the Facebook app without preserving the target URL on iOS.

**How to apply:** Use `navigator.share` with the URL only on iOS; the user chooses Facebook, and Facebook fetches the image from `og:image`. Desktop may use Facebook's web share dialog. Direct automated posting requires the separate Facebook authorization/API integration.