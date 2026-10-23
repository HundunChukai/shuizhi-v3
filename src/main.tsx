import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import HomePage from "./app/page";
import MainPage from "./app/main/page";
import AlertsPage from "./app/main/alerts/page";
import MonitoringPage from "./app/main/monitoring/page";
import PoolsPage from "./app/main/pools/page";
import DosingRecordsPage from "./app/main/dosing-records/page";
import { DataProvider } from "./app/components/DataContext";
import { DemoTourOverlay, DemoTourProvider } from "./app/components/DemoTour";
import "./app/globals.css";
import "./app/ocean-theme.css";

const routeComponents: Record<string, () => React.JSX.Element> = {
  "/": HomePage,
  "/main": MainPage,
  "/main/alerts": AlertsPage,
  "/main/monitoring": MonitoringPage,
  "/main/pools": PoolsPage,
  "/main/dosing-records": DosingRecordsPage,
};

function currentRoute() {
  const rawRoute = window.location.hash.slice(1).split("?")[0] || "/";
  if (rawRoute === "/enter" || rawRoute === "/product") return "/main";
  return routeComponents[rawRoute] ? rawRoute : "/";
}

function App() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    // 应用挂载后允许启动层退场。
    const startup = window as unknown as {
      __APP_MOUNTED__?: boolean;
    };
    startup.__APP_MOUNTED__ = true;
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(currentRoute());
      // 自动演示靠改 hash 自动切页，这里同步回到页顶，保证每一步从模块开头讲起。
      window.scrollTo({ top: 0, behavior: "auto" });
    };

    const handleInternalLink = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const link = target?.closest("a");
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href || href.startsWith("mailto:") || href.startsWith("http")) return;

      if (href.startsWith("#") && !href.startsWith("#/")) {
        const section = document.getElementById(href.slice(1));
        if (section) {
          event.preventDefault();
          section.scrollIntoView({ behavior: "smooth" });
        }
        return;
      }

      if (href.startsWith("/")) {
        event.preventDefault();
        const destination = href.startsWith("/enter") || href.startsWith("/product")
          ? "/main"
          : href;
        window.location.hash = destination;
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    document.addEventListener("click", handleInternalLink);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      document.removeEventListener("click", handleInternalLink);
    };
  }, []);

  const Page = routeComponents[route] ?? HomePage;
  return <Page />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DataProvider>
      {/* 自动演示导览：Provider 负责脚本推进/自动切页/数据驱动，Overlay 是底部解说条。
          全局挂载，因此在任意页面都可见可停。 */}
      <DemoTourProvider>
        <App />
        <DemoTourOverlay />
      </DemoTourProvider>
    </DataProvider>
  </StrictMode>,
);
