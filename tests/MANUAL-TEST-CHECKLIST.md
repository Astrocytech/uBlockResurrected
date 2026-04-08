# uBlock Origin MV3 - Manual Test Checklist

## Element Picker (Zapper) Testing

Use this checklist to manually test the element picker functionality.

---

## Pre-flight Check

- [ ] Extension loads in Chrome without errors
- [ ] Service worker is running (check chrome://extensions > uBlock Origin > Inspect Views > Service Worker)
- [ ] No errors in service worker console

---

## Test 1: Basic Popup

**Steps:**
1. Click the uBlock Origin icon in the toolbar
2. Observe the popup opens

**Expected:**
- [ ] Popup opens correctly
- [ ] Power button is visible
- [ ] No JavaScript errors in console

---

## Test 2: Element Picker Opens

**Steps:**
1. Open a webpage (e.g., https://example.com)
2. Click the uBlock Origin icon
3. Click the **Element Picker** tool icon (mouse cursor with crosshair)
4. Observe the picker UI appears

**Expected:**
- [ ] Darkened overlay covers the page
- [ ] Full-screen iframe appears
- [ ] Element picker dialog is visible
- [ ] Mouse hover highlights elements with rectangles
- [ ] No JavaScript errors in console

---

## Test 3: ESC Key Closes Picker

**Steps:**
1. Complete Test 2 (picker is open)
2. Press the **ESC** key

**Expected:**
- [ ] Picker closes immediately
- [ ] Darkened overlay disappears
- [ ] No freeze or hang
- [ ] No JavaScript errors

---

## Test 4: Close Button Closes Picker

**Steps:**
1. Complete Test 2 (picker is open)
2. Click the **X** (close) button in the picker dialog

**Expected:**
- [ ] Picker closes immediately
- [ ] Darkened overlay disappears
- [ ] No freeze or hang
- [ ] No JavaScript errors

---

## Test 5: Tab Switching (Zapper Mode)

**Steps:**
1. Open a webpage with multiple elements (e.g., https://reddit.com)
2. Click the uBlock Origin icon
3. Click the **Zapper** tool icon (lightning bolt)
4. Verify picker opens
5. **Switch to a different tab**
6. Wait 5 seconds
7. **Switch back** to the original tab

**Expected:**
- [ ] Picker is still visible after switching back
- [ ] Picker is still functional (can hover and click)
- [ ] No freeze or hang
- [ ] No JavaScript errors

---

## Test 6: Create a Filter

**Steps:**
1. Complete Test 2 (picker is open)
2. Click on any element (e.g., an image or div)
3. Observe filter suggestions appear
4. Click **Create** button

**Expected:**
- [ ] Filter is created successfully
- [ ] Picker closes
- [ ] Filter is saved to user rules
- [ ] Element is blocked/hidden on the page

---

## Test 7: Zapper Blocks Element

**Steps:**
1. Open a webpage with visible elements
2. Click the uBlock Origin icon
3. Click the **Zapper** tool icon
4. Click directly on an element to block it

**Expected:**
- [ ] Element is removed from the page
- [ ] Filter is created automatically
- [ ] Picker remains open (stays in zapper mode)
- [ ] Can click more elements to block them

---

## Test 8: ESC Exits Zapper Mode

**Steps:**
1. Complete Test 7 (zapper is active)
2. Press the **ESC** key

**Expected:**
- [ ] Zapper mode exits
- [ ] Picker closes
- [ ] Page returns to normal browsing

---

## Error Reporting

If any test fails, please record:

1. **Test Name:** (e.g., "ESC Key Closes Picker")
2. **What Happened:** (e.g., "Page froze", "Error message appeared")
3. **Browser Console Errors:** (Copy any error messages)
4. **Service Worker Console Errors:** (Copy any error messages from chrome://extensions)

---

## Known Issues (Document Here)

| Issue | Test | Status | Notes |
|-------|------|--------|-------|
|      |      |        |       |
|      |      |        |       |

---

## Quick Verification Commands

```bash
# Rebuild extension
cd ~/Desktop/ASTROCYTECH/git_project/uBlockResurrected
bash tools/make-chrome-mv3.sh

# Check built files
ls -la dist/build/uBlock0.chromium-mv3/js/scriptlets/epicker.js
ls -la dist/build/uBlock0.chromium-mv3/js/epicker-ui-bundle.js

# Run automated tests
node tests/epicker-automated.mjs
```

---

*Last Updated: 2026-04-06*
