/**
 * Definisi data simulasi (menu, halaman, tabel, form).
 * Dihasilkan otomatis. Jangan edit manual.
 */
import type { SimAppDefinition } from '@sim/core'

export const definition: SimAppDefinition = {
  "name": "Demo Client",
  "description": "Simulasi hidup Api-Nigma — dibangun dari 3 layar rekonstruksi yang disetujui.",
  "brand": "Demo Client",
  "nav": [
    {
      "page": "dashboard",
      "label": "Dashboard"
    },
    {
      "page": "error-codes",
      "label": "Error Codes"
    }
  ],
  "pages": [
    {
      "key": "login",
      "title": "API Nigma Portal",
      "route": "/login",
      "subtitle": "Masuk untuk mengelola gateway, katalog kode error, dan playground HTTP.",
      "kind": "auth",
      "sections": [
        {
          "type": "form",
          "title": "API Nigma Portal",
          "description": "Form ini hanya simulasi. Tidak ada autentikasi nyata.",
          "fields": [
            {
              "key": "email_username",
              "label": "Email / Username",
              "type": "email",
              "required": true,
              "placeholder": "nama@contoh.com",
              "style": {
                "color": "rgb(17, 24, 39)",
                "backgroundColor": "rgb(255, 255, 255)",
                "fontFamily": "\"Plus Jakarta Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif",
                "fontSize": "12px",
                "fontWeight": "500",
                "lineHeight": "16px",
                "borderColor": "rgb(79, 70, 229)",
                "borderRadius": "12px",
                "boxShadow": "rgb(255, 255, 255) 0px 0px 0px 0px, rgba(99, 102, 241, 0.2) 0px 0px 0px 2px, rgba(0, 0, 0, 0) 0px 0px 0px 0px"
              },
              "iconSvg": "<svg class=\"w-4 h-4\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\">\n                                <path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207\"></path>\n                            </svg>"
            },
            {
              "key": "password",
              "label": "Password",
              "type": "password",
              "required": true,
              "placeholder": "••••••••",
              "style": {
                "color": "rgb(17, 24, 39)",
                "backgroundColor": "rgb(250, 250, 249)",
                "fontFamily": "\"JetBrains Mono\", monospace",
                "fontSize": "12px",
                "lineHeight": "16px",
                "borderColor": "rgb(231, 229, 228)",
                "borderRadius": "12px"
              },
              "iconSvg": "<svg class=\"w-4 h-4\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\">\n                                <path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z\"></path>\n                            </svg>",
              "toggleVisibility": true
            },
            {
              "key": "ingat_saya",
              "label": "Ingat Saya",
              "type": "checkbox",
              "required": false,
              "style": {
                "color": "rgb(79, 70, 229)",
                "fontFamily": "\"Plus Jakarta Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif",
                "fontSize": "12px",
                "lineHeight": "16px"
              }
            }
          ],
          "submitLabel": "Masuk ke Portal",
          "successToast": "Login disimulasikan. Mengarahkan ke halaman aplikasi.",
          "linkRight": {
            "label": "Lupa Password?",
            "action": "Aksi simulasi: Lupa Password?."
          },
          "prefill": {
            "label": "Isi Otomatis (Demo)",
            "values": {
              "email_username": "admin@nigma.id",
              "password": "password"
            }
          },
          "navigateTo": "/dashboard"
        }
      ],
      "theme": {
        "page": {
          "backgroundColor": "rgb(250, 250, 249)",
          "fontFamily": "\"Plus Jakarta Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif"
        },
        "primary": {
          "backgroundColor": "rgb(17, 24, 39)",
          "color": "rgb(255, 255, 255)",
          "borderRadius": "9999px",
          "fontWeight": "700"
        },
        "text": {
          "heading": {
            "color": "rgb(17, 24, 39)",
            "fontSize": "24px",
            "fontWeight": "900"
          },
          "body": {
            "color": "rgb(120, 113, 108)",
            "fontSize": "12px"
          }
        },
        "card": {
          "box": {
            "x": 512,
            "y": 112,
            "w": 416,
            "h": 635
          },
          "backgroundColor": "rgb(255, 255, 255)",
          "borderColor": "rgba(231, 229, 228, 0.7)",
          "borderRadius": "24px",
          "boxShadow": "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(231, 229, 228, 0.4) 0px 20px 25px -5px, rgba(231, 229, 228, 0.4) 0px 8px 10px -6px"
        }
      }
    },
    {
      "key": "dashboard",
      "title": "API Nigma Portal Overview",
      "route": "/dashboard",
      "subtitle": "/dashboard",
      "kind": "dashboard",
      "sections": [
        {
          "type": "actions",
          "title": "Aksi halaman",
          "items": [
            {
              "label": "Tambah Project Banner Utama",
              "variant": "primary",
              "toast": "Aksi simulasi: Tambah Project Banner Utama."
            },
            {
              "label": "Katalog Error",
              "variant": "secondary",
              "toast": "Aksi simulasi: Katalog Error.",
              "navigateTo": "/error-codes"
            },
            {
              "label": "Buka Playground",
              "variant": "secondary",
              "toast": "Aksi simulasi: Buka Playground."
            },
            {
              "label": "Tambah Project Sekunder",
              "variant": "primary",
              "toast": "Aksi simulasi: Tambah Project Sekunder."
            },
            {
              "label": "Playground SIMRS NigmaCare",
              "variant": "secondary",
              "toast": "Aksi simulasi: Playground SIMRS NigmaCare."
            },
            {
              "label": "Playground PIMS Mobile API",
              "variant": "secondary",
              "toast": "Aksi simulasi: Playground PIMS Mobile API."
            },
            {
              "label": "Playground PIMS Mobile API 2",
              "variant": "secondary",
              "toast": "Aksi simulasi: Playground PIMS Mobile API 2."
            }
          ]
        },
        {
          "type": "list",
          "title": "Tautan & kartu",
          "items": [
            {
              "label": "Statistik Total APIs",
              "meta": "Kartu dari rekonstruksi"
            },
            {
              "label": "Statistik Active Services",
              "meta": "Kartu dari rekonstruksi"
            },
            {
              "label": "Statistik Requests Today",
              "meta": "Kartu dari rekonstruksi"
            },
            {
              "label": "Statistik Error Rate",
              "meta": "Kartu dari rekonstruksi"
            }
          ]
        }
      ],
      "theme": {
        "page": {
          "backgroundColor": "rgb(250, 250, 249)",
          "fontFamily": "\"Plus Jakarta Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif"
        },
        "primary": {
          "backgroundColor": "rgb(79, 70, 229)",
          "color": "rgb(255, 255, 255)",
          "borderRadius": "16px",
          "fontWeight": "700"
        },
        "text": {
          "heading": {
            "color": "rgb(17, 24, 39)",
            "fontSize": "30px",
            "fontWeight": "900"
          },
          "body": {
            "color": "rgb(120, 113, 108)",
            "fontSize": "14px"
          }
        },
        "card": {
          "box": {
            "x": 280,
            "y": 448,
            "w": 746,
            "h": 659
          },
          "backgroundColor": "rgb(255, 255, 255)",
          "borderColor": "rgba(231, 229, 228, 0.7)",
          "borderRadius": "24px",
          "boxShadow": "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.05) 0px 1px 2px 0px"
        }
      }
    },
    {
      "key": "error-codes",
      "title": "Katalog Referensi Kode Error - API Nigma - Developer API Gateway",
      "route": "/error-codes",
      "subtitle": "/error-codes",
      "kind": "table",
      "sections": [
        {
          "type": "table",
          "title": "Daftar Error",
          "dataset": "daftar_error",
          "createLabel": "Tambah Error Code",
          "filters": [
            {
              "key": "project",
              "label": "Filter Project",
              "options": [
                {
                  "value": "SIMRS",
                  "label": "SIMRS"
                },
                {
                  "value": "PIMS",
                  "label": "PIMS"
                },
                {
                  "value": "Mobile",
                  "label": "Mobile"
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  "datasets": [
    {
      "key": "daftar_error",
      "label": "Daftar Error",
      "fields": [
        {
          "key": "code",
          "label": "CODE",
          "type": "text",
          "required": true
        },
        {
          "key": "project",
          "label": "Project",
          "type": "select",
          "required": true,
          "options": [
            {
              "value": "SIMRS",
              "label": "SIMRS"
            },
            {
              "value": "PIMS",
              "label": "PIMS"
            },
            {
              "value": "Mobile",
              "label": "Mobile"
            }
          ]
        },
        {
          "key": "title_nama_kesalahan",
          "label": "TITLE / NAMA KESALAHAN",
          "type": "text",
          "required": true
        },
        {
          "key": "deskripsi",
          "label": "DESKRIPSI",
          "type": "textarea",
          "required": true
        }
      ],
      "columns": [
        {
          "key": "code",
          "label": "CODE",
          "type": "text"
        },
        {
          "key": "kode_project",
          "label": "KODE & PROJECT",
          "type": "text",
          "template": "{code} / {project}"
        },
        {
          "key": "title_nama_kesalahan",
          "label": "TITLE / NAMA KESALAHAN",
          "type": "text"
        },
        {
          "key": "deskripsi",
          "label": "DESKRIPSI",
          "type": "text"
        },
        {
          "key": "action",
          "label": "AKSI",
          "type": "action"
        }
      ],
      "searchKeys": [
        "code",
        "project",
        "title_nama_kesalahan",
        "deskripsi"
      ]
    }
  ]
}
