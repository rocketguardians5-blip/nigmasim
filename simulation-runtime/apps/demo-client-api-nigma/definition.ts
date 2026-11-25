/**
 * Definisi data simulasi (menu, halaman, tabel, form).
 * Dihasilkan otomatis. Jangan edit manual.
 */
import type { SimAppDefinition } from '@sim/core'

export const definition: SimAppDefinition = {
  "name": "Demo Client",
  "description": "Simulasi hidup Api-Nigma — dibangun dari 4 layar rekonstruksi yang disetujui.",
  "brand": "Demo Client",
  "nav": [
    {
      "page": "dashboard",
      "label": "Dashboard"
    },
    {
      "page": "playground",
      "label": "API Playground"
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
              "label": "Ciutkan Sidebar",
              "variant": "secondary",
              "toast": "Aksi simulasi: Ciutkan Sidebar."
            },
            {
              "label": "Profil Pengguna Nigma Administrator",
              "variant": "secondary",
              "toast": "Aksi simulasi: Profil Pengguna Nigma Administrator."
            },
            {
              "label": "Tambah Project Utama",
              "variant": "primary",
              "toast": "Aksi simulasi: Tambah Project Utama."
            },
            {
              "label": "Katalog Error",
              "variant": "secondary",
              "toast": "Aksi simulasi: Katalog Error.",
              "navigateTo": "/error-codes"
            },
            {
              "label": "Buka Playground Utama",
              "variant": "secondary",
              "toast": "Aksi simulasi: Buka Playground Utama.",
              "navigateTo": "/playground"
            },
            {
              "label": "Tambah Project Matrix",
              "variant": "primary",
              "toast": "Aksi simulasi: Tambah Project Matrix."
            },
            {
              "label": "Playground SIMRS NigmaCare",
              "variant": "secondary",
              "toast": "Aksi simulasi: Playground SIMRS NigmaCare.",
              "navigateTo": "/playground"
            },
            {
              "label": "Playground PIMS Mobile API",
              "variant": "secondary",
              "toast": "Aksi simulasi: Playground PIMS Mobile API.",
              "navigateTo": "/playground"
            },
            {
              "label": "Playground PIMS Identity",
              "variant": "secondary",
              "toast": "Aksi simulasi: Playground PIMS Identity.",
              "navigateTo": "/playground"
            }
          ]
        },
        {
          "type": "list",
          "title": "Tautan & kartu",
          "items": [
            {
              "label": "Stat Total APIs",
              "meta": "Kartu dari rekonstruksi"
            },
            {
              "label": "Stat Active Services",
              "meta": "Kartu dari rekonstruksi"
            },
            {
              "label": "Stat Requests Today",
              "meta": "Kartu dari rekonstruksi"
            },
            {
              "label": "Stat Error Rate",
              "meta": "Kartu dari rekonstruksi"
            },
            {
              "label": "Layanan SIMRS NigmaCare",
              "meta": "Kartu dari rekonstruksi"
            },
            {
              "label": "Layanan PIMS Mobile API",
              "meta": "Kartu dari rekonstruksi"
            },
            {
              "label": "Layanan PIMS Mobile API (Identity)",
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
      "key": "playground",
      "title": "API Playground - Interactive HTTP Client - Developer API Gateway",
      "route": "/playground",
      "subtitle": "/playground",
      "kind": "custom",
      "sections": [
        {
          "type": "form",
          "title": "Form simulasi",
          "fields": [
            {
              "key": "pilih_active_project_simrs_nigmacare",
              "label": "Pilih Active Project (SIMRS NIGMACARE)",
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
              ],
              "style": {
                "color": "rgb(100, 116, 139)",
                "fontFamily": "\"Plus Jakarta Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif",
                "fontSize": "16px",
                "lineHeight": "24px",
                "borderColor": "rgb(229, 231, 235)"
              }
            },
            {
              "key": "pencarian_endpoint",
              "label": "Pencarian Endpoint",
              "type": "text",
              "required": true,
              "placeholder": "Cari endpoint di project ini...",
              "style": {
                "color": "rgb(17, 24, 39)",
                "backgroundColor": "rgb(248, 250, 252)",
                "fontFamily": "\"Plus Jakarta Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif",
                "fontSize": "12px",
                "lineHeight": "16px",
                "borderColor": "rgb(226, 232, 240)",
                "borderRadius": "12px"
              }
            },
            {
              "key": "metode_http_get",
              "label": "Metode HTTP (GET)",
              "type": "select",
              "required": true,
              "options": [
                {
                  "value": "GET",
                  "label": "GET"
                },
                {
                  "value": "POST",
                  "label": "POST"
                },
                {
                  "value": "PUT",
                  "label": "PUT"
                },
                {
                  "value": "PATCH",
                  "label": "PATCH"
                },
                {
                  "value": "DELETE",
                  "label": "DELETE"
                }
              ]
            },
            {
              "key": "input_url_api_request",
              "label": "Input URL API Request",
              "type": "text",
              "required": true,
              "placeholder": "https://api.example.com/v1/resource",
              "style": {
                "color": "rgb(17, 24, 39)",
                "backgroundColor": "rgb(250, 250, 249)",
                "fontFamily": "\"JetBrains Mono\", monospace",
                "fontSize": "12px",
                "lineHeight": "16px",
                "borderColor": "rgb(231, 229, 228)",
                "borderRadius": "12px"
              }
            },
            {
              "key": "parameter_aktif_nik",
              "label": "Parameter Aktif (nik)",
              "type": "text",
              "required": true,
              "placeholder": "Cari endpoint di project ini...",
              "style": {
                "color": "rgb(79, 70, 229)",
                "fontFamily": "\"Plus Jakarta Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif",
                "fontSize": "16px",
                "lineHeight": "24px"
              }
            },
            {
              "key": "key_query_parameter_nik",
              "label": "Key Query Parameter (nik)",
              "type": "text",
              "required": true,
              "placeholder": "Parameter Key",
              "style": {
                "color": "rgb(17, 24, 39)",
                "backgroundColor": "rgb(250, 250, 249)",
                "fontFamily": "\"JetBrains Mono\", monospace",
                "fontSize": "12px",
                "lineHeight": "16px",
                "borderColor": "rgb(231, 229, 228)",
                "borderRadius": "8px"
              }
            }
          ],
          "submitLabel": "Kirim Request (Send)",
          "successToast": "Kirim Request (Send) disimulasikan. Tidak ada API asli yang dipanggil."
        },
        {
          "type": "actions",
          "title": "Aksi halaman",
          "items": [
            {
              "label": "Tentukan/Sembunyikan Sidebar",
              "variant": "secondary",
              "toast": "Aksi simulasi: Tentukan/Sembunyikan Sidebar."
            },
            {
              "label": "Profil Pengguna (Nigma Administrator)",
              "variant": "secondary",
              "toast": "Aksi simulasi: Profil Pengguna (Nigma Administrator)."
            },
            {
              "label": "Import / Tambah Endpoint",
              "variant": "primary",
              "toast": "Aksi simulasi: Import / Tambah Endpoint."
            },
            {
              "label": "+ Manual Endpoint",
              "variant": "secondary",
              "toast": "Aksi simulasi: + Manual Endpoint."
            },
            {
              "label": "+ Tambah Project",
              "variant": "primary",
              "toast": "Aksi simulasi: + Tambah Project."
            },
            {
              "label": "+ Manual (Koleksi)",
              "variant": "secondary",
              "toast": "Aksi simulasi: + Manual (Koleksi)."
            },
            {
              "label": "Import (Koleksi)",
              "variant": "primary",
              "toast": "Aksi simulasi: Import (Koleksi)."
            },
            {
              "label": "+ Tambah Parameter",
              "variant": "primary",
              "toast": "Aksi simulasi: + Tambah Parameter."
            }
          ]
        },
        {
          "type": "list",
          "title": "Tautan & kartu",
          "items": [
            {
              "label": "Endpoint Cari Pasien by NIK",
              "meta": "Kartu dari rekonstruksi"
            },
            {
              "label": "Endpoint Generate SEP BPJS VClaim",
              "meta": "Kartu dari rekonstruksi"
            },
            {
              "label": "Endpoint Cek Stok Obat Depo Farmasi",
              "meta": "Kartu dari rekonstruksi"
            },
            {
              "label": "Endpoint Finalisasi Rekam Medis",
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
          "backgroundColor": "rgb(255, 255, 255)",
          "color": "rgb(68, 64, 60)",
          "borderRadius": "12px",
          "fontWeight": "700"
        },
        "card": {
          "box": {
            "x": 568,
            "y": 162,
            "w": 459,
            "h": 730
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
          "title": "Katalog Kode Error Standar API Nigma",
          "dataset": "katalog_kode_error_standar_api_nigma",
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
        },
        {
          "type": "actions",
          "title": "Aksi halaman",
          "items": [
            {
              "label": "Sembunyikan Sidebar",
              "variant": "secondary",
              "toast": "Aksi simulasi: Sembunyikan Sidebar."
            },
            {
              "label": "Profil Nigma Administrator",
              "variant": "secondary",
              "toast": "Aksi simulasi: Profil Nigma Administrator."
            },
            {
              "label": "Cari",
              "variant": "secondary",
              "toast": "Aksi simulasi: Cari."
            },
            {
              "label": "Hapus Kode Error Row 1",
              "variant": "danger",
              "toast": "Aksi simulasi: Hapus Kode Error Row 1."
            },
            {
              "label": "Hapus Kode Error Row 2",
              "variant": "danger",
              "toast": "Aksi simulasi: Hapus Kode Error Row 2."
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
          "color": "rgb(168, 162, 158)",
          "borderRadius": "12px"
        },
        "card": {
          "box": {
            "x": 280,
            "y": 462,
            "w": 1130,
            "h": 1189
          },
          "backgroundColor": "rgb(255, 255, 255)",
          "borderColor": "rgba(231, 229, 228, 0.7)",
          "borderRadius": "24px",
          "boxShadow": "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.05) 0px 1px 2px 0px"
        }
      }
    }
  ],
  "datasets": [
    {
      "key": "katalog_kode_error_standar_api_nigma",
      "label": "Katalog Kode Error Standar API Nigma",
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
