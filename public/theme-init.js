// Applies the saved theme before first paint (external file so the Content-Security-Policy can stay strict).
try { var t = localStorage.getItem('theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) {}
