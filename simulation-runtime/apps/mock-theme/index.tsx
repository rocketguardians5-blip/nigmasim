import { SimApp, type SimAppDefinition } from '@sim/core'

export const mockThemedDefinition: SimAppDefinition = {
  name: 'Mock Themed App',
  brand: 'Themed Brand',
  nav: [{ page: 'login', label: 'Login' }],
  datasets: [],
  pages: [
    {
      key: 'login',
      title: 'Portal Masuk Themed',
      route: '/login',
      subtitle: 'Silakan masuk ke akun Anda',
      kind: 'auth',
      theme: {
        page: {
          backgroundColor: '#0f172a',
          fontFamily: 'Inter, sans-serif',
        },
        card: {
          backgroundColor: '#1e293b',
          borderColor: '#334155',
          borderWidth: '1px',
          borderRadius: '16px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        },
        primary: {
          backgroundColor: 'rgb(17, 24, 39)',
          color: 'rgb(255, 255, 255)',
          borderRadius: '9999px',
          fontWeight: 700,
        },
        text: {
          heading: {
            color: 'rgb(248, 250, 252)',
            fontSize: '20px',
            fontWeight: 700,
          },
          body: {
            color: 'rgb(148, 163, 184)',
            fontSize: '14px',
            fontWeight: 400,
          },
        },
      },
      sections: [
        {
          type: 'form',
          title: 'Form Login',
          fields: [
            {
              key: 'email',
              label: 'Email Pengguna',
              type: 'email',
              placeholder: 'nama@domain.com',
              required: true,
              style: { borderColor: 'rgb(71, 85, 105)' },
              iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/></svg>',
            },
            {
              key: 'password',
              label: 'Kata Sandi',
              type: 'password',
              placeholder: '••••••••',
              required: true,
              toggleVisibility: true,
            },
          ],
          submitLabel: 'Masuk Sekarang',
          style: { padding: '24px' },
        },
      ],
    },
  ],
}

export default function MockThemedApp() {
  return <SimApp definition={mockThemedDefinition} seed={{}} slug="mock-theme" />
}
