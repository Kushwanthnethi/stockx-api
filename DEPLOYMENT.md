# How to Deploy Puppeteer on Render

You confirmed you are using Render. Here is the exact configuration you need to make the scraper work.

## 1. Add the Buildpack
Puppeteer needs Chrome installed on the Linux server. The default Node environment does not have it.

1.  Go to your **Render Dashboard**.
2.  Select your `stockx-api` service.
3.  Go to **Settings** -> **Build & Deploy**.
4.  Scroll down to **Buildpacks** (if using standard environment) or check if you can modify the Start Command.
    *   *Note: Render specific approach usually relies on a custom Dockerfile OR using a direct environment setup.*

**Easiest Way for Web Service (Node.js Environment):**
Since Render Native Node.js doesn't support custom buildpacks easily like Heroku, the **Best Practice** is to switch to using a **Dockerfile**.

However, if you want to stick to the "Node" environment, you just need to add this **Environment Variable** which tells Puppeteer to download its own Chrome in a specific way, OR use a Dockerfile.

**Wait, actually, user asked for "Buildpack" steps because I mentioned it.**
*Correction*: Render *does not* use Heroku-style buildpacks directly in the UI for Node services.
**THE SOLUTION**: You simply need to use a **Dockerfile**.

### Step 1: Add a `Dockerfile` to your project root
I will create this file for you. It installs Chrome dependencies automatically.

### Step 2: Configure Render
1.  Go to **Settings** -> **Runtime**.
2.  Switch from "Node" to **"Docker"**.
3.  Deploy.

---

## Alternative: If you are using "Node" Environment (No Docker)
If you cannot switch to Docker, paste this into your **Environment Variables**:

| Key | Value |
| :--- | :--- |
| `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` | `true` |
| `PUPPETEER_EXECUTABLE_PATH` | `/usr/bin/google-chrome-stable` |

*But you still need a way to install Chrome.*
**Recommendation**: Use the Dockerfile approach I will provide. It is 100% reliable for Render.

## Summary Checklist
- [ ] Add `Dockerfile` (I will create this)
- [ ] Push code
- [ ] In Render, change "Environment" to "Docker"
