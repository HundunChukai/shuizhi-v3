import "./splash.js";

const visit = window.__SPLASH_STATE__;
let application;

function startApplication() {
  if (application) return application;

  const font = document.createElement("link");
  font.rel = "stylesheet";
  font.href = "https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800;900&display=swap";
  font.media = "print";
  const showFont = () => { font.media = "all"; };
  font.onload = () => {
    if (!document.getElementById("splash")) showFont();
  };
  if (visit) visit.showApp = showFont;
  document.head.appendChild(font);

  application = import("./main.tsx").catch((error) => {
    if (visit) visit.appFailed = true;
    const loader = document.querySelector(".sc-loader");
    if (loader) loader.textContent = "页面加载失败，请刷新重试";
    console.error("Failed to load application", error);
  });
  return application;
}

if (visit) visit.startApp = startApplication;
if (!visit || visit.seen || visit.appRequested || !document.getElementById("splash")) {
  startApplication();
}
