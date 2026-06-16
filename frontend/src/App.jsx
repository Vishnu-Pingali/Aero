import Header from "./components/Header";
import StatsBar from "./components/StatsBar";
import MapView from "./components/MapView";
import GlobeView from "./components/GlobeView";
import Sidebar from "./components/Sidebar";
import ToastNotifications from "./components/ToastNotifications";
import EmergencyModal from "./components/EmergencyModal";
import { StoreProvider, useStore } from "./store/AppStore";
import "./index.css";

function AppInner() {
  const { state } = useStore();
  return (
    <div className={`${state.theme === "light" ? "light" : "dark"} w-full h-full flex flex-col bg-background text-on-surface font-body overflow-hidden`}>
      {/* Fixed header */}
      <Header />

      {/* Stats ticker */}
      <StatsBar />

      {/* Main content */}
      <main className="fixed inset-0 pt-[100px] flex overflow-hidden">
        {state.viewMode === "3d" ? <GlobeView /> : <MapView />}
        <Sidebar />
      </main>

      {/* Overlays */}
      <ToastNotifications />
      <EmergencyModal />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppInner />
    </StoreProvider>
  );
}
