import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntApp } from 'antd';
import koKR from 'antd/locale/ko_KR';
import App from './App';
import './styles/global.css';
import './styles/print.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={koKR}
        theme={{
          token: {
            fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            colorPrimary: '#4A6CF7',
            borderRadius: 8,
          },
          components: {
            Button: { borderRadius: 8, controlHeight: 40 },
            Input: { borderRadius: 8, controlHeight: 40 },
            Select: { borderRadius: 8, controlHeight: 40 },
            Table: { headerBg: '#fafbfc', headerColor: '#475569', rowHoverBg: '#f8fafc', borderColor: '#f1f5f9' },
          },
        }}
      >
        <AntApp>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <App />
          </BrowserRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
