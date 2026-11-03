import { Outlet } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Navigation from "./components/Navigation";

const App = () => {
  return (
    <div className="flex min-h-dvh flex-col">
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
      <Navigation />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="container-page flex flex-col items-center justify-between gap-2 py-6 text-sm text-muted sm:flex-row">
          <p>
            <span className="font-display font-semibold text-ink">
              True Crime Generator
            </span>{" "}
            · Ebooks for Google Play Books
          </p>
          <p>English EPUB &amp; PDF, ready to publish</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
