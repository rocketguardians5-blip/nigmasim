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
      "subtitle": "/login",
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
              "required": true
            },
            {
              "key": "password",
              "label": "Password",
              "type": "password",
              "required": true
            },
            {
              "key": "ingat_saya",
              "label": "Ingat Saya",
              "type": "checkbox",
              "required": false
            }
          ],
          "submitLabel": "MASUK KE PORTAL",
          "successToast": "Login disimulasikan. Mengarahkan ke halaman aplikasi.",
          "prefill": {
            "label": "Isi Otomatis (Demo)",
            "values": {
              "email_username": "admin@nigma.id",
              "password": "password"
            }
          },
          "navigateTo": "/dashboard"
        },
        {
          "type": "actions",
          "title": "Aksi lain",
          "items": [
            {
              "label": "Tampilkan/Sembunyikan Password",
              "variant": "secondary",
              "toast": "Aksi simulasi: Tampilkan/Sembunyikan Password."
            },
            {
              "label": "Lupa Password?",
              "variant": "secondary",
              "toast": "Aksi simulasi: Lupa Password?."
            }
          ]
        }
      ]
    },
    {
      "key": "dashboard",
      "title": "Dashboard Overview - API Nigma Portal - Developer API Gateway",
      "route": "/dashboard",
      "subtitle": "/dashboard",
      "kind": "dashboard",
      "sections": [
        {
          "type": "actions",
          "title": "Aksi halaman",
          "items": [
            {
              "label": "Tambah Project",
              "variant": "primary",
              "toast": "Aksi simulasi: Tambah Project."
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
              "label": "Tambah Project (Matrix)",
              "variant": "primary",
              "toast": "Aksi simulasi: Tambah Project (Matrix)."
            },
            {
              "label": "Playground SIMRS",
              "variant": "secondary",
              "toast": "Aksi simulasi: Playground SIMRS."
            },
            {
              "label": "Playground PIMS",
              "variant": "secondary",
              "toast": "Aksi simulasi: Playground PIMS."
            },
            {
              "label": "Playground PIMS 2",
              "variant": "secondary",
              "toast": "Aksi simulasi: Playground PIMS 2."
            },
            {
              "label": "Playground Mobile",
              "variant": "secondary",
              "toast": "Aksi simulasi: Playground Mobile."
            },
            {
              "label": "Playground Test API",
              "variant": "secondary",
              "toast": "Aksi simulasi: Playground Test API."
            },
            {
              "label": "Inspect di API Playground",
              "variant": "secondary",
              "toast": "Aksi simulasi: Inspect di API Playground."
            }
          ]
        }
      ]
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
