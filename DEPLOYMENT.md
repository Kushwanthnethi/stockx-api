# How to Deploy Puppeteer on Render

You confirmed you are using Render. Here is the exact configuration you need to make the scraper work.

## 1. Add the Buildpack
Puppeteer needs Chrome installed on the Linux server. The default Node environment does not have it.

1.  Go to your **Render Dashboard**.
2.  Select your `stockx-api` service.
3.  Go to **Settings** -> **Build & Deploy**.
4.  Scroll down to **Buildpacks** (if using standard environment) or check if you can modify the Start Command.
    *   *Note: Render specific approach usually relies on a custom Dockerfile OR using a direct environment setup.*

### Solution 2: The "Build Script" Hack (For Existing Node Service)
If you must use the existing service:

1.  **Add Environment Variables** in Render:
    *   `PUPPETEER_CACHE_DIR`: `/opt/render/project/puppeteer`
2.  **Add a Build Command**:
    *   Go to Settings -> Build Command.
    *   Change it to: `./render-build.sh`
3.  **Push the `render-build.sh` file** I just created.

*Warning: This is flaky. If it fails, you HAVE to do the "New Service" method.*

*But you still need a way to install Chrome.*
**Recommendation**: Use the Dockerfile approach I will provide. It is 100% reliable for Render.

## Summary Checklist
- [ ] Add `Dockerfile` (I will create this)
- [ ] Push code
- [ ] In Render, change "Environment" to "Docker"
