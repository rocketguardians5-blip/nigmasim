import { useState, useEffect } from 'react'
import { workerApi, type SessionData } from '../lib/capture'
import { screensApi, type Screen } from '../lib/capture'
import { Button, Card, Badge, Field, Modal, Spinner, Alert, PageHeader, Tabs, TabList, Tab, TabPanels, TabPanel } from '../components/ui'
import { IconDownload, IconPlay, IconCopy, IconChevronRight, IconCheck, IconSearch, IconMagic } from '../components/icons'

type WizardStep = 'select' | 'analyze' | 'generate' | 'preview'

interface ComponentMapping {
  elementId: string
  componentType: 'dropdown' | 'modal' | 'table' | 'form' | 'card' | 'nav' | 'button' | 'input' | 'tabs' | 'accordion'
  componentName: string
  props: Record<string, any>
  interactions: Array<{ trigger: string; action: string; target?: string }>
  dataBinding?: { source: 'har' | 'storage' | 'mock'; path: string }
}

interface MockApiEndpoint {
  method: string
  path: string
  requestSchema?: Record<string, any>
  responseSchema: Record<string, any>
  mockData: any
  harEntryIndex: number
}

export function ReconstructionWizardPage() {
  const [step, setStep] = useState<WizardStep>('select')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mappings, setMappings] = useState<ComponentMapping[]>([])
  const [mockEndpoints, setMockEndpoints] = useState<MockApiEndpoint[]>([])
  const [generatedCode, setGeneratedCode] = useState<string>('')
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [screens, setScreens] = useState<Screen[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number>(1)
  const [searchTerm] = useState('')

  // Load screens from backend on mount
  useEffect(() => {
    loadScreens()
  }, [])

  const loadScreens = async () => {
    try {
      const res = await screensApi.list(selectedProjectId, { latest_only: true })
      setScreens(res.items)
    } catch (err: any) {
      setError(err.message || 'Gagal memuat screens')
    }
  }

  const loadSessionData = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await workerApi.sessionData()
      if (data.har_entries.length > 0 || Object.keys(data.component_states).length > 0) {
        analyzeData(data)
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data sesi worker')
    } finally {
      setLoading(false)
    }
  }

  const analyzeData = (data: SessionData) => {
    const newMappings: ComponentMapping[] = []
    const newEndpoints: MockApiEndpoint[] = []

    Object.entries(data.component_states).forEach(([key, state]) => {
      const componentType = state.type
      newMappings.push({
        elementId: key,
        componentType,
        componentName: `${componentType.charAt(0).toUpperCase() + componentType.slice(1)}_${key}`,
        props: {
          label: state.label,
          defaultOpen: state.isOpen,
          options: state.options || [],
          tabs: state.tabs || [],
          activeIndex: state.activeIndex || 0,
        },
        interactions: [
          { trigger: 'click', action: 'toggle' },
          ...(state.type === 'dropdown' && state.options ? state.options.map((opt, i) => ({ trigger: `select_${i}`, action: 'selectOption', target: opt })) : []),
          ...(state.type === 'tabs' && state.tabs ? state.tabs.map((_, i) => ({ trigger: `tab_${i}`, action: 'setActiveTab', target: String(i) })) : []),
        ],
      })
    })

    data.form_schemas.forEach((form, idx) => {
      form.fields.forEach((field, fieldIdx) => {
        newMappings.push({
          elementId: `form_${idx}_field_${fieldIdx}`,
          componentType: field.tag === 'select' ? 'dropdown' : field.type === 'checkbox' ? 'button' : 'input',
          componentName: `Form${idx}_${field.name}`,
          props: {
            label: field.label,
            type: field.type,
            required: field.required,
            placeholder: field.placeholder,
            options: field.options,
            name: field.name,
          },
          interactions: [{ trigger: 'change', action: 'updateValue' }],
          dataBinding: { source: 'mock', path: `forms.${idx}.${field.name}` },
        })
      })
    })

    data.har_entries.forEach((entry, idx) => {
      if (entry.response.body && typeof entry.response.body === 'object') {
        const path = new URL(entry.request.url).pathname
        newEndpoints.push({
          method: entry.request.method,
          path,
          requestSchema: entry.request.postData ? JSON.parse(entry.request.postData) : undefined,
          responseSchema: entry.response.body,
          mockData: entry.response.body,
          harEntryIndex: idx,
        })
      }
    })

    setMappings(newMappings)
    setMockEndpoints(newEndpoints)
    setStep('analyze')
  }

  const useApiNigmaTemplate = () => {
    // Pre-defined mappings for API Nigma Portal Dashboard
    const templateMappings: ComponentMapping[] = [
      {
        elementId: 'env_dropdown',
        componentType: 'dropdown',
        componentName: 'EnvironmentDropdown',
        props: {
          label: 'Environment',
          defaultOpen: false,
          options: ['Production', 'Staging', 'Local Sandbox'],
        },
        interactions: [
          { trigger: 'click', action: 'toggle' },
          { trigger: 'select_0', action: 'selectOption', target: 'Production' },
          { trigger: 'select_1', action: 'selectOption', target: 'Staging' },
          { trigger: 'select_2', action: 'selectOption', target: 'Local Sandbox' },
        ],
        dataBinding: { source: 'mock', path: 'ui.selectedEnvironment' },
      },
      {
        elementId: 'projects_table',
        componentType: 'table',
        componentName: 'ProjectsTable',
        props: {
          columns: ['Project', 'Service Key', 'Base URL', 'Status', 'Latency', 'Actions'],
          sortable: true,
          filterable: true,
        },
        interactions: [
          { trigger: 'row_click', action: 'viewDetail' },
          { trigger: 'edit_click', action: 'openEditModal' },
          { trigger: 'delete_click', action: 'deleteProject' },
        ],
        dataBinding: { source: 'mock', path: 'projects' },
      },
      {
        elementId: 'add_project_modal',
        componentType: 'modal',
        componentName: 'AddProjectModal',
        props: {
          label: 'Tambah Project Baru',
          defaultOpen: false,
          fields: [
            { name: 'name', label: 'Nama Project *', type: 'text', required: true, placeholder: 'Contoh: E-Logistik & Fleet' },
            { name: 'service_key', label: 'Service Key *', type: 'text', required: true, placeholder: 'Contoh: E-LOGISTIK' },
            { name: 'base_url', label: 'Base URL *', type: 'url', required: true, placeholder: 'https://api.nigma.id/v1/logistics' },
            { name: 'description', label: 'Deskripsi', type: 'textarea', required: false, placeholder: 'Deskripsi singkat project...' },
            { name: 'status', label: 'Status', type: 'select', required: true, options: ['Operational', 'Maintenance', 'Deprecated', 'Development'] },
          ],
        },
        interactions: [
          { trigger: 'open', action: 'openModal' },
          { trigger: 'close', action: 'closeModal' },
          { trigger: 'submit', action: 'addProject' },
        ],
        dataBinding: { source: 'mock', path: 'forms.addProject' },
      },
      {
        elementId: 'sidebar_nav',
        componentType: 'nav',
        componentName: 'SidebarNavigation',
        props: {
          items: ['Dashboard', 'Projects', 'Error Codes', 'HTTP Playground', 'Documentation'],
        },
        interactions: [
          { trigger: 'click', action: 'navigate' },
        ],
        dataBinding: { source: 'mock', path: 'ui.activeNav' },
      },
      {
        elementId: 'status_dropdown',
        componentType: 'dropdown',
        componentName: 'StatusDropdown',
        props: {
          label: 'Status',
          defaultOpen: false,
          options: ['Operational', 'Maintenance', 'Deprecated', 'Development'],
        },
        interactions: [
          { trigger: 'click', action: 'toggle' },
          { trigger: 'select_0', action: 'selectOption', target: 'Operational' },
          { trigger: 'select_1', action: 'selectOption', target: 'Maintenance' },
          { trigger: 'select_2', action: 'selectOption', target: 'Deprecated' },
          { trigger: 'select_3', action: 'selectOption', target: 'Development' },
        ],
        dataBinding: { source: 'mock', path: 'forms.addProject.status' },
      },
    ]

    const templateEndpoints: MockApiEndpoint[] = [
      {
        method: 'GET',
        path: '/api/v1/projects',
        responseSchema: { projects: [] },
        mockData: [],
        harEntryIndex: 0,
      },
      {
        method: 'POST',
        path: '/api/v1/projects',
        responseSchema: { project: {} },
        mockData: {},
        harEntryIndex: 1,
      },
      {
        method: 'PUT',
        path: '/api/v1/projects/:id',
        responseSchema: { project: {} },
        mockData: {},
        harEntryIndex: 2,
      },
      {
        method: 'DELETE',
        path: '/api/v1/projects/:id',
        responseSchema: { success: true },
        mockData: { success: true },
        harEntryIndex: 3,
      },
    ]

    setMappings(templateMappings)
    setMockEndpoints(templateEndpoints)
    setStep('analyze')
    generateMockStore()
  }

  const generateMockStore = () => {
    const storeCode = `// Auto-generated Mock Store untuk Alpine.js
// API Nigma Portal Interactive Clone
// Features: Dropdown (Environment, Status), Modal (Add/Edit Project), Table CRUD, localStorage Persistence

const useAppStore = Alpine.store('app', {
  // ===== STATE =====
  user: null,
  projects: [
    { id: 1, name: 'E-Logistik & Fleet', service_key: 'E-LOGISTIK', base_url: 'https://api.nigma.id/v1/logistics', status: 'Operational', latency: '24ms', createdAt: '2026-01-15T10:30:00Z' },
    { id: 2, name: 'API Gateway Core', service_key: 'GATEWAY', base_url: 'https://api.nigma.id/v1/gateway', status: 'Operational', latency: '12ms', createdAt: '2026-01-10T08:15:00Z' },
    { id: 3, name: 'Monitoring Service', service_key: 'MONITOR', base_url: 'https://api.nigma.id/v1/monitor', status: 'Maintenance', latency: '0ms', createdAt: '2026-01-12T14:20:00Z' },
  ],
  environments: ['Production', 'Staging', 'Local Sandbox'],
  selectedEnvironment: 'Production',
  ui: {
    dropdownOpen: {},
    modalOpen: {},
    activeTabs: {},
    accordionOpen: {},
    activeNav: 'Dashboard',
  },
  forms: {
    addProject: { name: '', service_key: '', base_url: '', description: '', status: 'Operational' },
    editProject: { id: null, name: '', service_key: '', base_url: '', description: '', status: 'Operational' },
  },
  
  // ===== UI ACTIONS =====
  toggleDropdown(id) {
    this.ui.dropdownOpen[id] = !this.ui.dropdownOpen[id]
  },
  selectDropdownOption(id, option) {
    this.ui.dropdownOpen[id] = false
    // Update bound form field if any
    if (id === 'env_dropdown') this.selectedEnvironment = option
    if (id === 'status_dropdown') this.forms.addProject.status = option
  },
  openModal(id) {
    this.ui.modalOpen[id] = true
    if (id === 'add_project_modal') this.resetAddForm()
    if (id.startsWith('edit_project_modal_')) {
      const projectId = parseInt(id.split('_').pop())
      const project = this.projects.find(p => p.id === projectId)
      if (project) this.forms.editProject = { ...project }
    }
  },
  closeModal(id) {
    this.ui.modalOpen[id] = false
    if (id === 'add_project_modal') this.resetAddForm()
    if (id.startsWith('edit_project_modal_')) this.forms.editProject = { id: null, name: '', service_key: '', base_url: '', description: '', status: 'Operational' }
  },
  setActiveTab(tabGroup, index) {
    this.ui.activeTabs[tabGroup] = index
  },
  toggleAccordion(id) {
    this.ui.accordionOpen[id] = !this.ui.accordionOpen[id]
  },
  setActiveNav(nav) {
    this.ui.activeNav = nav
  },
  resetAddForm() {
    this.forms.addProject = { name: '', service_key: '', base_url: '', description: '', status: 'Operational' }
  },
  
  // ===== CRUD OPERATIONS =====
  addProject(project) {
    const newProject = {
      id: Date.now(),
      ...project,
      latency: '0ms',
      createdAt: new Date().toISOString()
    }
    this.projects.unshift(newProject)
    this.saveToStorage()
    this.closeModal('add_project_modal')
    return newProject
  },
  updateProject(id, data) {
    const idx = this.projects.findIndex(p => p.id === id)
    if (idx >= 0) {
      this.projects[idx] = { ...this.projects[idx], ...data }
      this.saveToStorage()
    }
    this.closeModal('edit_project_modal_' + id)
  },
  deleteProject(id) {
    if (confirm('Hapus project ini?')) {
      this.projects = this.projects.filter(p => p.id !== id)
      this.saveToStorage()
    }
  },
  
  // ===== PERSISTENCE (localStorage) =====
  saveToStorage() {
    try {
      localStorage.setItem('nigmasim_projects', JSON.stringify(this.projects))
      localStorage.setItem('nigmasim_ui', JSON.stringify(this.ui))
      localStorage.setItem('nigmasim_forms', JSON.stringify(this.forms))
      localStorage.setItem('nigmasim_selectedEnvironment', this.selectedEnvironment)
    } catch (e) {
      console.error('Failed to save to localStorage:', e)
    }
  },
  loadFromStorage() {
    try {
      const projects = localStorage.getItem('nigmasim_projects')
      if (projects) this.projects = JSON.parse(projects)
      const ui = localStorage.getItem('nigmasim_ui')
      if (ui) this.ui = JSON.parse(ui)
      const forms = localStorage.getItem('nigmasim_forms')
      if (forms) this.forms = JSON.parse(forms)
      const env = localStorage.getItem('nigmasim_selectedEnvironment')
      if (env) this.selectedEnvironment = env
    } catch (e) {
      console.error('Failed to load from localStorage:', e)
    }
  },
  
  // ===== MOCK API HANDLERS =====
  async mockApiCall(method, path, data) {
    // GET /api/v1/projects
    if (method === 'GET' && path === '/api/v1/projects') {
      return { projects: this.projects }
    }
    // POST /api/v1/projects
    if (method === 'POST' && path === '/api/v1/projects') {
      const newProject = { id: Date.now(), ...data, latency: '0ms', createdAt: new Date().toISOString() }
      this.projects.unshift(newProject)
      this.saveToStorage()
      return { project: newProject }
    }
    // PUT /api/v1/projects/:id
    if (method === 'PUT' && path.startsWith('/api/v1/projects/')) {
      const id = parseInt(path.split('/').pop())
      const idx = this.projects.findIndex(p => p.id === id)
      if (idx >= 0) {
        this.projects[idx] = { ...this.projects[idx], ...data }
        this.saveToStorage()
        return { project: this.projects[idx] }
      }
      return { error: 'Project not found' }
    }
    // DELETE /api/v1/projects/:id
    if (method === 'DELETE' && path.startsWith('/api/v1/projects/')) {
      const id = parseInt(path.split('/').pop())
      this.projects = this.projects.filter(p => p.id !== id)
      this.saveToStorage()
      return { success: true }
    }
    return { error: 'Endpoint not mocked', method, path }
  },
  
  init() {
    this.loadFromStorage()
  }
})

// Initialize on load
document.addEventListener('alpine:init', () => {
  useAppStore.init()
})`

    setGeneratedCode(storeCode)
    setStep('generate')
    generateSimulatorHtml()
  }

  const generateSimulatorHtml = () => {
    const html = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NigmaSim - API Nigma Portal (Interactive Clone)</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.8/dist/cdn.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: {
                        sans: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
                        mono: ['JetBrains Mono', 'monospace'],
                    },
                    colors: {
                        broken: '#FAFAF9',
                        charcoal: '#111827',
                    }
                }
            }
        }
    </script>
    <style>
        [x-cloak] { display: none !important; }
        body { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #FAFAF9; color: #111827; }
        .dropdown-menu { animation: fadeIn 0.15s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .modal-overlay { animation: fadeIn 0.15s ease-out; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .modal-content { animation: slideUp 0.2s ease-out; }
    </style>
</head>
<body x-data x-init="$store.app.init()" class="min-h-screen bg-[#FAFAF9]">
    <!-- Mock Store -->
    <script>
${generatedCode}
    </script>

    <!-- Dashboard Layout -->
    <div class="min-h-screen flex flex-col" x-cloak>
        <!-- Top Navigation -->
        <nav class="bg-white border-b border-stone-200 sticky top-0 z-40" x-data="{ mobileMenuOpen: false }">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex items-center justify-between h-16">
                    <div class="flex items-center gap-8">
                        <a href="#" class="flex items-center gap-2">
                            <img src="http://192.168.2.119:8000/images/nigma-logo.png" alt="Nigma" class="w-8 h-8" onerror="this.style.display='none'" />
                            <span class="font-black text-xl text-[#111827]">API Nigma</span>
                        </a>
                        <div class="hidden md:flex items-center gap-6">
                            <template x-for="nav in ['Dashboard', 'Projects', 'Error Codes', 'Playground', 'Documentation']" :key="nav">
                                <a href="#" @click.prevent="$store.app.setActiveNav(nav)" 
                                   :class="$store.app.ui.activeNav === nav ? 'text-[#111827] font-semibold' : 'text-stone-600 hover:text-[#111827]'"
                                   class="text-sm font-medium transition-colors" x-text="nav"></a>
                            </template>
                        </div>
                    </div>
                    <div class="flex items-center gap-4">
                        <!-- Environment Dropdown -->
                        <div class="relative" x-data="{ open: false }">
                            <button @click="open = !open" @click.outside="open = false" class="flex items-center gap-2 px-3 py-2 rounded-xl bg-stone-100 border border-stone-200 text-sm font-medium text-stone-700 hover:bg-stone-200 transition-colors">
                                <span x-text="$store.app.selectedEnvironment"></span>
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                            </button>
                            <div x-show="open" x-transition:enter="transition ease-out duration-100" x-transition:enter-start="transform opacity-0 scale-95" x-transition:enter-end="transform opacity-100 scale-100" x-transition:leave="transition ease-in duration-75" x-transition:leave-start="transform opacity-100 scale-100" x-transition:leave-end="transform opacity-0 scale-95" class="dropdown-menu absolute right-0 mt-2 w-56 bg-white rounded-xl border border-stone-200 shadow-lg py-1 z-50" style="display: none;">
                                <template x-for="env in $store.app.environments" :key="env">
                                    <button @click="$store.app.selectedEnvironment = env; $store.app.selectDropdownOption('env_dropdown', env); open = false" class="w-full px-4 py-2 text-left text-sm text-stone-700 hover:bg-stone-50 transition-colors" x-text="env"></button>
                                </template>
                            </div>
                        </div>
                        <button class="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600 hover:bg-stone-200 transition-colors" title="Notifications"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0018 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg></button>
                        <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center"><span class="text-indigo-700 font-bold text-sm">AD</span></div>
                    </div>
                </div>
            </div>
        </nav>

        <div class="flex flex-1 max-w-7xl mx-auto w-full px-4 py-8">
            <!-- Sidebar -->
            <aside class="w-64 flex-shrink-0 hidden lg:block pr-8">
                <nav class="space-y-1" x-data="{ openGroups: {} }">
                    <template x-for="group in [
                        { label: 'Dashboard', icon: '<svg class=\\"w-5 h-5\\" fill=\\"none\\" stroke=\\"currentColor\\" viewBox=\\"0 0 24 24\\"><path stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\" stroke-width=\\"2\\" d=\\"M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z\\" /></svg>', items: ['Overview'] },
                        { label: 'Projects', icon: '<svg class=\\"w-5 h-5\\" fill=\\"none\\" stroke=\\"currentColor\\" viewBox=\\"0 0 24 24\\"><path stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\" stroke-width=\\"2\\" d=\\"M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z\\" /></svg>', items: ['All Projects', 'Create New'] },
                        { label: 'Error Codes', icon: '<svg class=\\"w-5 h-5\\" fill=\\"none\\" stroke=\\"currentColor\\" viewBox=\\"0 0 24 24\\"><path stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\" stroke-width=\\"2\\" d=\\"M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4\\" /></svg>', items: ['Catalog', 'Search'] },
                        { label: 'HTTP Playground', icon: '<svg class=\\"w-5 h-5\\" fill=\\"none\\" stroke=\\"currentColor\\" viewBox=\\"0 0 24 24\\"><path stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\" stroke-width=\\"2\\" d=\\"M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4\\" /></svg>', items: ['Request Builder', 'History'] },
                        { label: 'Documentation', icon: '<svg class=\\"w-5 h-5\\" fill=\\"none\\" stroke=\\"currentColor\\" viewBox=\\"0 0 24 24\\"><path stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\" stroke-width=\\"2\\" d=\\"M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z\\" /></svg>', items: ['API Reference', 'Guides'] },
                    ]" :key="group.label">
                        <div class="border-b border-stone-100 pb-2">
                            <div class="flex items-center gap-3 px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-stone-500">
                                <span x-html="group.icon"></span>
                                <span x-text="group.label"></span>
                            </div>
                            <div class="space-y-1 mt-1">
                                <template x-for="item in group.items" :key="item">
                                    <a href="#" @click.prevent="$store.app.setActiveNav(item)" 
                                       :class="$store.app.ui.activeNav === item ? 'bg-stone-100 text-[#111827]' : 'text-stone-600 hover:bg-stone-100 hover:text-[#111827]'"
                                       class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors" x-text="item"></a>
                                </template>
                            </div>
                        </div>
                    </template>
                </nav>
            </aside>

            <!-- Main Content -->
            <main class="flex-1 min-w-0">
                <div class="mb-8">
                    <h1 class="text-2xl font-black text-[#111827]" x-text="$store.app.ui.activeNav"></h1>
                    <p class="text-sm text-stone-500 mt-1" x-show="$store.app.ui.activeNav === 'Dashboard'">Kelola project dan monitor performa gateway</p>
                    <p class="text-sm text-stone-500 mt-1" x-show="$store.app.ui.activeNav === 'Projects'">Kelola daftar project API gateway</p>
                    <p class="text-sm text-stone-500 mt-1" x-show="$store.app.ui.activeNav === 'Error Codes'">Katalog referensi kode error API</p>
                    <p class="text-sm text-stone-500 mt-1" x-show="$store.app.ui.activeNav === 'Playground'">HTTP client interaktif untuk testing API</p>
                    <p class="text-sm text-stone-500 mt-1" x-show="$store.app.ui.activeNav === 'Documentation'">Dokumentasi API dan panduan integrasi</p>
                </div>

                <!-- Dashboard View -->
                <div x-show="$store.app.ui.activeNav === 'Dashboard' || $store.app.ui.activeNav === 'Projects'">
                    <!-- Projects Table Card -->
                    <div class="bg-white rounded-3xl border border-stone-200/70 shadow-xl shadow-stone-200/40 overflow-hidden">
                        <div class="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
                            <h2 class="text-lg font-bold text-[#111827]">Daftar Project</h2>
                            <button @click="$store.app.openModal('add_project_modal')" class="h-10 px-4 rounded-full font-bold text-xs uppercase tracking-wider text-white bg-[#111827] hover:bg-black active:scale-[0.99] transition-all flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" /></svg>
                                <span>Tambah Project</span>
                            </button>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full">
                                <thead class="bg-stone-50/50">
                                    <tr class="text-left text-xs font-bold uppercase tracking-wider text-stone-600">
                                        <th class="px-6 py-3">Project</th>
                                        <th class="px-6 py-3 hidden md:table-cell">Service Key</th>
                                        <th class="px-6 py-3 hidden lg:table-cell">Base URL</th>
                                        <th class="px-6 py-3">Status</th>
                                        <th class="px-6 py-3 text-right">Latency</th>
                                        <th class="px-6 py-3 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-stone-100" x-init="$store.app.loadFromStorage()">
                                    <template x-for="project in $store.app.projects" :key="project.id">
                                        <tr class="hover:bg-stone-50/50 transition-colors">
                                            <td class="px-6 py-4">
                                                <div class="font-medium text-[#111827]" x-text="project.name"></div>
                                                <div class="text-xs text-stone-500 font-mono" x-text="project.service_key"></div>
                                            </td>
                                            <td class="px-6 py-3 hidden md:table-cell font-mono text-xs text-stone-600" x-text="project.service_key"></td>
                                            <td class="px-6 py-3 hidden lg:table-cell font-mono text-xs text-stone-500 truncate max-w-xs" x-text="project.base_url"></td>
                                            <td class="px-6 py-3">
                                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                                                    :class="project.status === 'Operational' ? 'bg-emerald-100 text-emerald-700' : project.status === 'Maintenance' ? 'bg-amber-100 text-amber-700' : project.status === 'Deprecated' ? 'bg-stone-100 text-stone-700' : 'bg-rose-100 text-rose-700'">
                                                    <span class="w-1.5 h-1.5 rounded-full mr-1.5" :class="project.status === 'Operational' ? 'bg-emerald-500' : project.status === 'Maintenance' ? 'bg-amber-500' : project.status === 'Deprecated' ? 'bg-stone-500' : 'bg-rose-500'"></span>
                                                    <span x-text="project.status"></span>
                                                </span>
                                            </td>
                                            <td class="px-6 py-3 text-right font-mono text-sm text-stone-600" x-text="project.latency"></td>
                                            <td class="px-6 py-3 text-right">
                                                <div class="flex items-center justify-end gap-2">
                                                    <button @click="$store.app.openModal('edit_project_modal_' + project.id)" class="p-2 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-[#111827] transition-colors" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                                    <button @click="$store.app.deleteProject(project.id)" class="p-2 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-red-600 transition-colors" title="Hapus"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                                </div>
                                            </td>
                                        </tr>
                                    </template>
                                    <tr x-show="$store.app.projects.length === 0">
                                        <td colspan="6" class="px-6 py-12 text-center text-stone-500">
                                            <svg class="w-12 h-12 mx-auto text-stone-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                            <p class="font-medium text-stone-700">Belum ada project</p>
                                            <p class="text-sm mt-1">Klik "Tambah Project" untuk memulai</p>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Add Project Modal -->
                <div x-show="$store.app.ui.modalOpen.add_project_modal" x-transition:enter="transition ease-out duration-150" x-transition:enter-start="opacity-0" x-transition:enter-end="opacity-100" x-transition:leave="transition ease-in duration-100" x-transition:leave-start="opacity-100" x-transition:leave-end="opacity-0" class="fixed inset-0 z-50 overflow-y-auto" style="display: none;">
                    <div class="flex min-h-full items-center justify-center p-4">
                        <div @click.outside="$store.app.closeModal('add_project_modal')" class="modal-overlay fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true"></div>
                        <div class="modal-content relative bg-white rounded-3xl shadow-xl max-w-lg w-full p-6 transform transition-all" x-cloak>
                            <div class="flex items-center justify-between mb-6">
                                <h3 class="text-lg font-bold text-[#111827]">Tambah Project Baru</h3>
                                <button @click="$store.app.closeModal('add_project_modal')" class="p-1 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                            </div>
                            <form @submit.prevent="$store.app.addProject($store.app.forms.addProject)" x-data="{ form: $store.app.forms.addProject, errors: {} }">
                                <div class="space-y-4">
                                    <div>
                                        <label class="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">Nama Project *</label>
                                        <input type="text" x-model="form.name" @blur="errors.name = !form.name" @input="$store.app.forms.addProject.name = form.name" class="w-full h-11 px-3.5 rounded-xl text-sm bg-stone-50 border border-stone-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all placeholder:text-stone-400" placeholder="Contoh: E-Logistik & Fleet" required />
                                        <p x-show="errors.name" class="mt-1 text-xs text-red-600">Nama project wajib diisi</p>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">Service Key *</label>
                                        <input type="text" x-model="form.service_key" @blur="errors.service_key = !form.service_key" @input="$store.app.forms.addProject.service_key = form.service_key" class="w-full h-11 px-3.5 rounded-xl text-sm bg-stone-50 border border-stone-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all placeholder:text-stone-400 font-mono" placeholder="Contoh: E-LOGISTIK" required />
                                        <p x-show="errors.service_key" class="mt-1 text-xs text-red-600">Service key wajib diisi</p>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">Base URL *</label>
                                        <input type="url" x-model="form.base_url" @blur="errors.base_url = !form.base_url" @input="$store.app.forms.addProject.base_url = form.base_url" class="w-full h-11 px-3.5 rounded-xl text-sm bg-stone-50 border border-stone-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all placeholder:text-stone-400 font-mono" placeholder="https://api.nigma.id/v1/logistics" required />
                                        <p x-show="errors.base_url" class="mt-1 text-xs text-red-600">Base URL wajib diisi</p>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">Deskripsi</label>
                                        <textarea x-model="form.description" @input="$store.app.forms.addProject.description = form.description" rows="3" class="w-full px-3.5 py-3 rounded-xl text-sm bg-stone-50 border border-stone-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all placeholder:text-stone-400 resize-none" placeholder="Deskripsi singkat project..."></textarea>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">Status</label>
                                        <div x-data="{ open: false }" class="relative">
                                            <button @click="open = !open" @click.outside="open = false" @click="form.status = $store.app.forms.addProject.status" class="w-full h-11 px-3.5 rounded-xl text-sm bg-stone-50 border border-stone-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all flex items-center justify-between" type="button">
                                                <span x-text="form.status"></span>
                                                <svg class="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                                            </button>
                                            <div x-show="open" x-transition:enter="transition ease-out duration-100" x-transition:enter-start="transform opacity-0 scale-95" x-transition:enter-end="transform opacity-100 scale-100" x-transition:leave="transition ease-in duration-75" x-transition:leave-start="transform opacity-100 scale-100" x-transition:leave-end="transform opacity-0 scale-95" class="dropdown-menu absolute z-10 w-full mt-1 bg-white rounded-xl border border-stone-200 shadow-lg py-1" style="display: none;">
                                                <template x-for="status in ['Operational', 'Maintenance', 'Deprecated', 'Development']" :key="status">
                                                    <button @click="form.status = status; $store.app.forms.addProject.status = status; $store.app.selectDropdownOption('status_dropdown', status); open = false" class="w-full px-4 py-2 text-left text-sm text-stone-700 hover:bg-stone-50 transition-colors" x-text="status"></button>
                                                </template>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-stone-100">
                                    <button type="button" @click="$store.app.closeModal('add_project_modal')" class="h-10 px-4 rounded-xl font-medium text-sm text-stone-700 bg-stone-100 hover:bg-stone-200 transition-colors">Batal</button>
                                    <button type="submit" class="h-10 px-6 rounded-xl font-bold text-sm text-white bg-[#111827] hover:bg-black active:scale-[0.99] transition-all flex items-center gap-2">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" /></svg>
                                        <span>Simpan Project</span>
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>

                <!-- Edit Project Modals (Dynamic) -->
                <template x-for="project in $store.app.projects" :key="project.id">
                    <div x-show="$store.app.ui.modalOpen['edit_project_modal_' + project.id]" x-transition:enter="transition ease-out duration-150" x-transition:enter-start="opacity-0" x-transition:enter-end="opacity-100" x-transition:leave="transition ease-in duration-100" x-transition:leave-start="opacity-100" x-transition:leave-end="opacity-0" class="fixed inset-0 z-50 overflow-y-auto" style="display: none;">
                        <div class="flex min-h-full items-center justify-center p-4">
                            <div @click.outside="$store.app.closeModal('edit_project_modal_' + project.id)" class="modal-overlay fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true"></div>
                            <div class="modal-content relative bg-white rounded-3xl shadow-xl max-w-lg w-full p-6 transform transition-all" x-cloak>
                                <div class="flex items-center justify-between mb-6">
                                    <h3 class="text-lg font-bold text-[#111827]">Edit Project</h3>
                                    <button @click="$store.app.closeModal('edit_project_modal_' + project.id)" class="p-1 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                                </div>
                                <form @submit.prevent="$store.app.updateProject(project.id, $store.app.forms.editProject)" x-data="{ form: $store.app.forms.editProject, errors: {} }">
                                    <div class="space-y-4">
                                        <div>
                                            <label class="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">Nama Project *</label>
                                            <input type="text" x-model="form.name" @blur="errors.name = !form.name" @input="$store.app.forms.editProject.name = form.name" class="w-full h-11 px-3.5 rounded-xl text-sm bg-stone-50 border border-stone-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all placeholder:text-stone-400" :value="form.name" required />
                                            <p x-show="errors.name" class="mt-1 text-xs text-red-600">Nama project wajib diisi</p>
                                        </div>
                                        <div>
                                            <label class="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">Service Key *</label>
                                            <input type="text" x-model="form.service_key" @blur="errors.service_key = !form.service_key" @input="$store.app.forms.editProject.service_key = form.service_key" class="w-full h-11 px-3.5 rounded-xl text-sm bg-stone-50 border border-stone-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all placeholder:text-stone-400 font-mono" :value="form.service_key" required />
                                            <p x-show="errors.service_key" class="mt-1 text-xs text-red-600">Service key wajib diisi</p>
                                        </div>
                                        <div>
                                            <label class="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">Base URL *</label>
                                            <input type="url" x-model="form.base_url" @blur="errors.base_url = !form.base_url" @input="$store.app.forms.editProject.base_url = form.base_url" class="w-full h-11 px-3.5 rounded-xl text-sm bg-stone-50 border border-stone-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all placeholder:text-stone-400 font-mono" :value="form.base_url" required />
                                            <p x-show="errors.base_url" class="mt-1 text-xs text-red-600">Base URL wajib diisi</p>
                                        </div>
                                        <div>
                                            <label class="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">Deskripsi</label>
                                            <textarea x-model="form.description" @input="$store.app.forms.editProject.description = form.description" rows="3" class="w-full px-3.5 py-3 rounded-xl text-sm bg-stone-50 border border-stone-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all placeholder:text-stone-400 resize-none" :value="form.description" placeholder="Deskripsi singkat project..."></textarea>
                                        </div>
                                        <div>
                                            <label class="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">Status</label>
                                            <div x-data="{ open: false }" class="relative">
                                                <button @click="open = !open" @click.outside="open = false" class="w-full h-11 px-3.5 rounded-xl text-sm bg-stone-50 border border-stone-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all flex items-center justify-between" type="button">
                                                    <span x-text="form.status"></span>
                                                    <svg class="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                                                </button>
                                                <div x-show="open" x-transition:enter="transition ease-out duration-100" x-transition:enter-start="transform opacity-0 scale-95" x-transition:enter-end="transform opacity-100 scale-100" x-transition:leave="transition ease-in duration-75" x-transition:leave-start="transform opacity-100 scale-100" x-transition:leave-end="transform opacity-0 scale-95" class="dropdown-menu absolute z-10 w-full mt-1 bg-white rounded-xl border border-stone-200 shadow-lg py-1" style="display: none;">
                                                    <template x-for="status in ['Operational', 'Maintenance', 'Deprecated', 'Development']" :key="status">
                                                        <button @click="form.status = status; $store.app.forms.editProject.status = status; open = false" class="w-full px-4 py-2 text-left text-sm text-stone-700 hover:bg-stone-50 transition-colors" x-text="status"></button>
                                                    </template>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-stone-100">
                                        <button type="button" @click="$store.app.closeModal('edit_project_modal_' + project.id)" class="h-10 px-4 rounded-xl font-medium text-sm text-stone-700 bg-stone-100 hover:bg-stone-200 transition-colors">Batal</button>
                                        <button type="submit" class="h-10 px-6 rounded-xl font-bold text-sm text-white bg-[#111827] hover:bg-black active:scale-[0.99] transition-all flex items-center gap-2">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                            <span>Simpan Perubahan</span>
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </template>

                <!-- Other Views Placeholder -->
                <div x-show="$store.app.ui.activeNav === 'Error Codes'" class="bg-white rounded-3xl border border-stone-200/70 shadow-xl shadow-stone-200/40 p-8 text-center">
                    <svg class="w-16 h-16 mx-auto text-stone-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    <h3 class="text-lg font-bold text-[#111827]">Error Codes Catalog</h3>
                    <p class="text-stone-500 mt-1">Katalog referensi kode error API Nigma</p>
                    <p class="text-sm text-stone-400 mt-4">Data dari capture session akan ditampilkan di sini</p>
                </div>
                <div x-show="$store.app.ui.activeNav === 'Playground'" class="bg-white rounded-3xl border border-stone-200/70 shadow-xl shadow-stone-200/40 p-8 text-center">
                    <svg class="w-16 h-16 mx-auto text-stone-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                    <h3 class="text-lg font-bold text-[#111827]">HTTP Playground</h3>
                    <p class="text-stone-500 mt-1">Interactive HTTP client untuk testing API</p>
                    <p class="text-sm text-stone-400 mt-4">Fitur playground akan ditampilkan di sini</p>
                </div>
                <div x-show="$store.app.ui.activeNav === 'Documentation'" class="bg-white rounded-3xl border border-stone-200/70 shadow-xl shadow-stone-200/40 p-8 text-center">
                    <svg class="w-16 h-16 mx-auto text-stone-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <h3 class="text-lg font-bold text-[#111827]">Documentation</h3>
                    <p class="text-stone-500 mt-1">Dokumentasi API dan panduan integrasi</p>
                    <p class="text-sm text-stone-400 mt-4">Konten dokumentasi akan ditampilkan di sini</p>
                </div>
            </main>
        </div>
    </div>

    <!-- Alpine.js Store Definition (Injected) -->
    <script>
        document.addEventListener('alpine:init', () => {
            Alpine.store('app', {
                user: null,
                projects: [
                    { id: 1, name: 'E-Logistik & Fleet', service_key: 'E-LOGISTIK', base_url: 'https://api.nigma.id/v1/logistics', status: 'Operational', latency: '24ms', createdAt: '2026-01-15T10:30:00Z' },
                    { id: 2, name: 'API Gateway Core', service_key: 'GATEWAY', base_url: 'https://api.nigma.id/v1/gateway', status: 'Operational', latency: '12ms', createdAt: '2026-01-10T08:15:00Z' },
                    { id: 3, name: 'Monitoring Service', service_key: 'MONITOR', base_url: 'https://api.nigma.id/v1/monitor', status: 'Maintenance', latency: '0ms', createdAt: '2026-01-12T14:20:00Z' },
                ],
                environments: ['Production', 'Staging', 'Local Sandbox'],
                selectedEnvironment: 'Production',
                ui: { dropdownOpen: {}, modalOpen: {}, activeTabs: {}, accordionOpen: {}, activeNav: 'Dashboard' },
                forms: { addProject: { name: '', service_key: '', base_url: '', description: '', status: 'Operational' }, editProject: { id: null, name: '', service_key: '', base_url: '', description: '', status: 'Operational' } },
                toggleDropdown(id) { this.ui.dropdownOpen[id] = !this.ui.dropdownOpen[id] },
                selectDropdownOption(id, option) { this.ui.dropdownOpen[id] = false; if (id === 'env_dropdown') this.selectedEnvironment = option; if (id === 'status_dropdown') this.forms.addProject.status = option },
                openModal(id) { this.ui.modalOpen[id] = true; if (id === 'add_project_modal') this.forms.addProject = { name: '', service_key: '', base_url: '', description: '', status: 'Operational' }; if (id.startsWith('edit_project_modal_')) { const pid = parseInt(id.split('_').pop()); const p = this.projects.find(x => x.id === pid); if (p) this.forms.editProject = { ...p } } },
                closeModal(id) { this.ui.modalOpen[id] = false; if (id === 'add_project_modal') this.forms.addProject = { name: '', service_key: '', base_url: '', description: '', status: 'Operational' }; if (id.startsWith('edit_project_modal_')) this.forms.editProject = { id: null, name: '', service_key: '', base_url: '', description: '', status: 'Operational' } },
                setActiveTab(tabGroup, index) { this.ui.activeTabs[tabGroup] = index },
                toggleAccordion(id) { this.ui.accordionOpen[id] = !this.ui.accordionOpen[id] },
                setActiveNav(nav) { this.ui.activeNav = nav },
                addProject(project) { const np = { id: Date.now(), ...project, latency: '0ms', createdAt: new Date().toISOString() }; this.projects.unshift(np); this.saveToStorage(); return np },
                updateProject(id, data) { const idx = this.projects.findIndex(p => p.id === id); if (idx >= 0) { this.projects[idx] = { ...this.projects[idx], ...data }; this.saveToStorage() } },
                deleteProject(id) { this.projects = this.projects.filter(p => p.id !== id); this.saveToStorage() },
                saveToStorage() { try { localStorage.setItem('nigmasim_projects', JSON.stringify(this.projects)); localStorage.setItem('nigmasim_ui', JSON.stringify(this.ui)); localStorage.setItem('nigmasim_forms', JSON.stringify(this.forms)); localStorage.setItem('nigmasim_selectedEnvironment', this.selectedEnvironment) } catch {} },
                loadFromStorage() { try { const p = localStorage.getItem('nigmasim_projects'); if (p) this.projects = JSON.parse(p); const u = localStorage.getItem('nigmasim_ui'); if (u) this.ui = JSON.parse(u); const f = localStorage.getItem('nigmasim_forms'); if (f) this.forms = JSON.parse(f); const e = localStorage.getItem('nigmasim_selectedEnvironment'); if (e) this.selectedEnvironment = e } catch {} },
                mockApiCall(method, path, data) { if (method === 'GET' && path === '/api/v1/projects') return { projects: this.projects }; if (method === 'POST' && path === '/api/v1/projects') { const np = { id: Date.now(), ...data, latency: '0ms', createdAt: new Date().toISOString() }; this.projects.unshift(np); this.saveToStorage(); return { project: np } }; if (method === 'PUT' && path.startsWith('/api/v1/projects/')) { const id = parseInt(path.split('/').pop()); const idx = this.projects.findIndex(p => p.id === id); if (idx >= 0) { this.projects[idx] = { ...this.projects[idx], ...data }; this.saveToStorage(); return { project: this.projects[idx] } }; return { error: 'Not found' } }; if (method === 'DELETE' && path.startsWith('/api/v1/projects/')) { const id = parseInt(path.split('/').pop()); this.projects = this.projects.filter(p => p.id !== id); this.saveToStorage(); return { success: true } }; return { error: 'Not mocked', method, path } },
                init() { this.loadFromStorage() }
            })
        })
    </script>
</body>
</html>`

    setPreviewHtml(html)
    setShowPreviewModal(true)
  }

  const downloadSimulator = () => {
    if (!previewHtml) return
    const blob = new Blob([previewHtml], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'nigmasim-api-nigma-interactive-clone.html'
    a.click()
    URL.revokeObjectURL(url)
    alert('Simulator berhasil di-download! Buka file HTML di browser untuk test dropdown & input data.')
  }

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredScreens = screens.filter(s => 
    s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.screen_key.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading && step === 'analyze') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reconstruction Wizard"
        description="Generate interactive clone untuk API Nigma Portal: dropdown, modal, table CRUD, localStorage persistence"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline-primary" onClick={loadSessionData} disabled={loading}>
              <IconDownload className="w-4 h-4 mr-2" /> Load Worker Session
            </Button>
            <Button onClick={useApiNigmaTemplate} variant="primary">
              <IconMagic className="w-4 h-4 mr-2" /> Use API Nigma Template
            </Button>
            <Button onClick={generateSimulatorHtml} disabled={!generatedCode || loading}>
              <IconPlay className="w-4 h-4 mr-2" /> Generate & Preview
            </Button>
          </div>
        }
      />

      {error && <Alert tone="danger" title="Error">{error}</Alert>}

      {/* Step Indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(['select', 'analyze', 'generate', 'preview'] as WizardStep[]).map((s, i) => (
          <div key={s} className={`flex items-center gap-1 ${step === s || (['select', 'analyze', 'generate', 'preview'].indexOf(step) > i) ? 'text-indigo-600' : 'text-stone-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center ${['select', 'analyze', 'generate', 'preview'].indexOf(step) <= i ? 'bg-indigo-600 text-white' : 'bg-stone-100'}`}>
              {['select', 'analyze', 'generate', 'preview'].indexOf(step) < i ? <IconCheck className="w-4 h-4" /> : <span className="font-bold">{i + 1}</span>}
            </span>
            {i < 3 && <IconChevronRight className="w-4 h-4" />}
          </div>
        ))}
      </div>

      {/* Step 1: Select Source */}
      <Card title="1. Pilih Sumber Data" description="Gunakan template API Nigma Portal siap pakai, atau load dari capture worker session yang aktif">
        <div className="space-y-4">
          {/* Template Option */}
          <div className="border-2 border-indigo-200 bg-indigo-50 rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center">
                  <IconMagic className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="font-bold text-[#111827]">API Nigma Portal Template (Recommended)</h4>
                  <p className="text-sm text-stone-600 mt-1">Template lengkap dengan: Environment dropdown, Project table CRUD (add/edit/delete), Add/Edit Project modal dengan form validasi, Sidebar navigation, localStorage persistence untuk data & UI state.</p>
                </div>
              </div>
              <Button onClick={useApiNigmaTemplate} className="h-10 px-6" variant="primary">
                <IconMagic className="w-4 h-4 mr-2" /> Gunakan Template
              </Button>
            </div>
          </div>

          {/* Worker Session Option */}
          <div className="border border-stone-200 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center">
                  <IconDownload className="w-6 h-6 text-stone-600" />
                </div>
                <div>
                  <h4 className="font-bold text-[#111827]">Load dari Capture Worker Session</h4>
                  <p className="text-sm text-stone-600 mt-1">Butuh session worker aktif dengan multi-state capture (dropdown open/closed, modal, HAR, form schemas). Klik tombol di header untuk load.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Existing Screens Reference */}
          <div className="border border-stone-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-[#111827]">Existing Screens (Project {selectedProjectId})</h4>
              <div className="flex items-center gap-2">
                <select value={selectedProjectId} onChange={e => { setSelectedProjectId(Number(e.target.value)); loadScreens(); }} className="h-9 px-3 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                  <option value={1}>Project 1: Demo Client</option>
                  <option value={2}>Project 2</option>
                </select>
                <Button variant="outline-primary" size="sm" onClick={loadScreens}><IconSearch className="w-4 h-4 mr-1" /> Refresh</Button>
              </div>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {filteredScreens.map(screen => (
                <div key={screen.id} className="flex items-center justify-between p-3 bg-stone-50 rounded-lg hover:bg-stone-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="w-20 text-center text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium ring-1 ring-inset ring-slate-200">{screen.capture_version}</span>
                    <div>
                      <p className="font-medium text-sm text-[#111827] truncate max-w-xs">{screen.title}</p>
                      <p className="text-xs text-stone-500 font-mono truncate max-w-xs">{screen.source_url}</p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full font-medium ring-1 ring-inset ring-brand-200">{screen.screen_key}</span>
                </div>
              ))}
              {filteredScreens.length === 0 && <p className="text-center text-stone-500 py-4">Tidak ada screen ditemukan</p>}
            </div>
          </div>
        </div>
      </Card>

      {/* Step 2: Analyze */}
      {step !== 'select' && (
        <Card title={`2. Komponen Interaktif (${mappings.length}) & API Endpoints (${mockEndpoints.length})`}>
          <Tabs defaultValue="components" className="w-full">
            <TabList className="grid w-full grid-cols-2">
              <Tab value="components">Komponen ({mappings.length})</Tab>
              <Tab value="api">API Endpoints ({mockEndpoints.length})</Tab>
            </TabList>
            <TabPanels>
              <TabPanel value="components">
                <div className="space-y-3 mt-4">
                  {mappings.map((m) => {
                    const isExpanded = expandedItems.has(m.elementId)
                    return (
                      <div key={m.elementId} className="border border-stone-200 rounded-xl overflow-hidden">
                        <button
                          onClick={() => toggleExpand(m.elementId)}
                          className="w-full px-4 py-3 flex items-center justify-between bg-stone-50 hover:bg-stone-100 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Badge tone={m.componentType === 'dropdown' ? 'success' : m.componentType === 'modal' ? 'warning' : m.componentType === 'table' ? 'info' : m.componentType === 'form' ? 'neutral' : 'neutral'}>{m.componentType}</Badge>
                            <span className="font-medium">{m.componentName}</span>
                          </div>
                          <Badge tone="neutral">{m.interactions.length} interactions</Badge>
                        </button>
                        {isExpanded && (
                          <div className="p-4 space-y-3 border-t border-stone-100 bg-white">
                            <div className="grid gap-3 sm:grid-cols-2 text-sm">
                              <Field label="Element ID"><input value={m.elementId} readOnly className="w-full px-3 py-2 bg-stone-100 rounded font-mono text-xs" /></Field>
                              <Field label="Component Type"><input value={m.componentType} readOnly className="w-full px-3 py-2 bg-stone-100 rounded font-mono text-xs" /></Field>
                              <Field label="Props"><textarea value={JSON.stringify(m.props, null, 2)} readOnly rows={3} className="w-full px-3 py-2 bg-stone-100 rounded font-mono text-xs" /></Field>
                              <Field label="Interactions"><textarea value={JSON.stringify(m.interactions, null, 2)} readOnly rows={3} className="w-full px-3 py-2 bg-stone-100 rounded font-mono text-xs" /></Field>
                              <Field label="Data Binding"><textarea value={JSON.stringify(m.dataBinding || {}, null, 2)} readOnly rows={2} className="w-full px-3 py-2 bg-stone-100 rounded font-mono text-xs" /></Field>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </TabPanel>
              <TabPanel value="api">
                <div className="space-y-3 mt-4">
                  {mockEndpoints.map((ep, i) => {
                    const isExpanded = expandedItems.has(`api_${i}`)
                    return (
                      <div key={i} className="border border-stone-200 rounded-xl overflow-hidden">
                        <button
                          onClick={() => toggleExpand(`api_${i}`)}
                          className="w-full px-4 py-3 flex items-center justify-between bg-stone-50 hover:bg-stone-100 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Badge tone={ep.method === 'GET' ? 'success' : ep.method === 'POST' ? 'neutral' : ep.method === 'DELETE' ? 'danger' : 'warning'}>{ep.method}</Badge>
                            <code className="font-mono text-sm">{ep.path}</code>
                          </div>
                          <Badge tone="neutral">Mock</Badge>
                        </button>
                        {isExpanded && (
                          <div className="p-4 space-y-3 border-t border-stone-100 bg-white">
                            <div className="grid gap-3 sm:grid-cols-2 text-sm">
                              <Field label="Response Schema"><textarea value={JSON.stringify(ep.responseSchema, null, 2)} readOnly rows={4} className="w-full px-3 py-2 bg-stone-100 rounded font-mono text-xs" /></Field>
                              <Field label="Mock Data"><textarea value={JSON.stringify(ep.mockData, null, 2)} readOnly rows={4} className="w-full px-3 py-2 bg-stone-100 rounded font-mono text-xs" /></Field>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Card>
      )}

      {/* Step 3: Generate */}
      {generatedCode && (
        <Card title="3. Generated Mock Store (Alpine.js + localStorage)">
          <div className="relative">
            <Button variant="outline-primary" size="sm" className="absolute top-2 right-2" onClick={() => navigator.clipboard.writeText(generatedCode)}>
              <IconCopy className="w-4 h-4 mr-1" /> Copy
            </Button>
            <pre className="bg-stone-900 text-stone-100 p-4 rounded-xl overflow-x-auto max-h-[400px] font-mono text-xs"><code>{generatedCode}</code></pre>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-stone-100">
            <Button onClick={generateSimulatorHtml} variant="primary">
              <IconPlay className="w-4 h-4 mr-2" /> Generate Full Simulator HTML
            </Button>
          </div>
        </Card>
      )}

      {/* Step 4: Preview Modal */}
      <Modal
        open={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        title="Interactive Simulator Preview"
        description="API Nigma Portal Clone - Test dropdown, modal, table CRUD, localStorage persistence"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline-primary" onClick={() => navigator.clipboard.writeText(previewHtml)}>
              <IconCopy className="w-4 h-4 mr-1" /> Copy HTML
            </Button>
            <Button onClick={downloadSimulator} variant="primary">
              <IconDownload className="w-4 h-4 mr-1" /> Download .html
            </Button>
          </div>
        }
      >
        <iframe
          srcDoc={previewHtml}
          className="w-full h-[70vh] border border-stone-200 rounded-xl"
          title="Simulator Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      </Modal>
    </div>
  )
}