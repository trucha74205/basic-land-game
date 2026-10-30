import { useDarkMode } from "@pxlkit/ui-kit";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { About } from "@/screens/About";
import { GameScreen } from "@/screens/Game";
import { Home } from "@/screens/Home";
import { Join } from "@/screens/Join";

export function App() {
  useDarkMode(); // applies the stored or system colour scheme to <html>
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/j/:code" element={<Join />} />
        <Route path="/g/:gameId" element={<GameScreen />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
