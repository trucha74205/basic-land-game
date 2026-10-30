import "@testing-library/jest-dom/vitest";

// the kit's scroll lock calls window.scrollTo, which jsdom does not implement
window.scrollTo = () => undefined;
