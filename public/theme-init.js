// Applies the saved theme before first paint (external file so the Content-Security-Policy can stay strict).
try { var t = localStorage.getItem('theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) {}
// The intro splash is shown once per browser session; skip it before first paint on later pages.
try { if (sessionStorage.getItem('intro')) document.documentElement.dataset.intro = 'skip'; } catch (e) {}
