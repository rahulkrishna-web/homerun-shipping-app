import "@/styles/globals.css";
import "@shopify/polaris/build/esm/styles.css";
import type { AppProps } from "next/app";
import { AppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AppProvider i18n={enTranslations}>
      <Component {...pageProps} />
    </AppProvider>
  );
}
