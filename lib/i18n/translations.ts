/**
 * 国际化翻译配置
 * 采用增量式翻译策略：
 * - 核心词汇必须翻译（如：保存、取消、删除等）
 * - 复杂句子可保持中文或逐步添加
 */

export type Language = 'zh' | 'en'

export interface Translations {
  // 通用操作
  common: {
    save: string
    cancel: string
    delete: string
    confirm: string
    close: string
    edit: string
    create: string
    add: string
    remove: string
    loading: string
    error: string
    success: string
    open: string
    export: string
    new: string
    closeAll: string
    noOpenTabs: string
    generate: string
    generatingDoc: string
    switchPanel: string
    enterDescription: string
    describeContent: string
    aiConfigInvalid: string
    configureApiFirst: string
    model: string
    config: string
    // 错误提示
     detachedNodeNotFound: string
     levelMismatchConnect: string
     childrenMovedToDetached: string
     parentNodeNotFound: string
     levelMismatchRoot: string
     levelMismatch: string
     cycleError: string
     parentChanged: string
     detachFailed: string
     nodeNotFound: string
     maxLevelReached: string
  }
  // 文件操作
  file: {
    newFile: string
    newFolder: string
    rename: string
    deleteFile: string
    deleteFolder: string
    importFile: string
    exportFile: string
    fileName: string
    folderName: string
    untitled: string
    openFileFailed: string
    exportSuccess: string
    exportFailed: string
    closeAllTabs: string
    emptyFolder: string
    dropToImport: string
    deleteFolderConfirm: string
    deleteFolderWarning: string
    enterFileName: string
    enterFolderName: string
    nameAZ: string
    nameZA: string
    updatedNewToOld: string
    updatedOldToNew: string
    createdNewToOld: string
    createdOldToNew: string
    unsavedChanges: string
  }
  // 节点编辑
  node: {
    editNode: string
    deleteNode: string
    deleteNodeConfirm: string
    deleteNodeOnly: string
    deleteNodeAndChildren: string
    deleteNodeOrphanChildren: string
    nodeTitle: string
    nodeContent: string
    addChild: string
    metadata: string
    metadataDescription: string
    childNodes: string
    newDocument: string
    title: string
    content: string
    enterTitle: string
    enterContent: string
    markdownSupport: string
    createChildNodes: string
     createChildNodesUnder: string
     quickAdd: string
     nodeTitles: string
     clear: string
     titlesPlaceholder: string
     titlesDescription: string
     willCreateNodes: string
     create: string
     cancel: string
     untitled: string
     newNode: string
    editFileName: string
    editNewKey: string
    editNewValue: string
    clickToEdit: string
    editKey: string
    editValue: string
    fileName: string
    untitledDoc: string
    clickKeyOrValue: string
    key: string
    value: string
    newKey: string
    enterFileNamePlaceholder: string
    enterKeyPlaceholder: string
    enterValuePlaceholder: string
    clickToEditLongContent: string
    metadataYaml: string
  }
  // 画布
  canvas: {
    layout: string
  }
  // 侧边栏
  sidebar: {
    files: string
    outline: string
    templates: string
    ai: string
    git: string
    settings: string
    help: string
    aiGenerate: string
    newFile: string
    openFile: string
    closeTab: string
    noFileOpen: string
    selectFromSidebar: string
    createNewFolder: string
    sortByName: string
    sortByDate: string
    expandAll: string
    collapseAll: string
    importTemplate: string
    addTemplate: string
    templateLibrary: string
    useTemplate: string
    previewTemplate: string
    editTemplate: string
    deleteTemplate: string
    enterDescription: string
    quickSend: string
    generating: string
    config: string
    configured: string
    notConfigured: string
    newBlankTemplate: string
    importTemplateFile: string
    noTemplates: string
    rightClickForMore: string
    newTemplate: string
    aiPlaceholder: string
    noHeadings: string
    useHashToCreate: string
  }
  // 预览
  preview: {
    preview: string
    edit: string
    noContent: string
    read: string
    previewMode: string
    editMode: string
    editPlaceholder: string
    markdownEditor: string
    noDocumentOpen: string
    characters: string
    lines: string
  }
  // 帮助
  help: {
    contactAuthor: string
    contactDesc: string
    contact: string
    community: string
    communityDesc: string
    join: string
    discordDesc: string
    githubDesc: string
    view: string
  }
  // 设置
  settings: {
    title: string
    language: string
    theme: string
    autoSave: string
    keyboardShortcuts: string
    aiProvider: string
    configIncomplete: string
    enterApiInfo: string
    connectionSuccess: string
    connectionFailed: string
    testing: string
    testConnection: string
    restoreDefault: string
    restored: string
    apiAddress: string
    apiKey: string
    modelName: string
    keyStoredLocally: string
    configured: string
    notTested: string
    volcengine: string
    siliconflow: string
    zhipu: string
    qianwen: string
    custom: string
    gitIntegration: string
    gitConnection: string
    openGitPanel: string
    openGitSettings: string
    gitConfigured: string
    gitNotConfigured: string
  }
  git: {
    provider: string
    token: string
    tokenPlaceholder: string
    namespace: string
    repository: string
    branch: string
    baseUrl: string
    customFlavor: string
    connect: string
    reconnect: string
    connected: string
    loadRepos: string
    reposLoaded: string
    availableBranches: string
    repositoryTree: string
    notConnected: string
    connectFirst: string
    emptyRepoTree: string
    pendingChanges: string
    noGitFileOpen: string
    uncommitted: string
    commitToRepo: string
    commitMessagePlaceholder: string
    commitSuccess: string
    commitFailed: string
    draftSaved: string
    fetchRemote: string
    remoteUpdated: string
    remoteUpToDate: string
    conflictDetected: string
    localChangesPreserved: string
    lastFetched: string
    createFile: string
    createFolder: string
    fileCreated: string
    folderCreated: string
    enterNewPath: string
    targetDirectory: string
    targetDirectoryRoot: string
    refreshTree: string
    stageChanges: string
    noStagedChanges: string
    stagedCount: string
    unstage: string
    stagedDeleteFile: string
    stagedDeleteFolder: string
    stageToGit: string
    stageToGitDescription: string
    stageConfirm: string
    stagedToGit: string
  }
  // Toast 消息
  toast: {
    saved: string
    deleted: string
    modified: string
    fileAdded: string
    fileDeleted: string
    folderAdded: string
    folderDeleted: string
    renameSuccess: string
    importSuccess: string
    importFailed: string
    saveFailed: string
    generateSuccess: string
    generateFailed: string
    templateDeleted: string
    templateCreated: string
    templateApplied: string
    loadTemplateFailed: string
    formatError: string
    selectMarkdownFile: string
    cannotReadFile: string
    loadingTemplates: string
  }
  // 模板
  template: {
    confirmDelete: string
    deleteWarning: string
  }
}

export const translations: Record<Language, Translations> = {
  zh: {
    common: {
      save: '保存',
      cancel: '取消',
      delete: '删除',
      confirm: '确认',
      close: '关闭',
      edit: '编辑',
      create: '创建',
      add: '添加',
      remove: '移除',
      loading: '加载中',
      error: '错误',
      success: '成功',
      open: '打开',
      export: '导出',
      new: '新建',
      closeAll: '全部关闭',
      noOpenTabs: '没有打开的标签页',
      generate: '生成',
      generatingDoc: '正在生成文档，请稍候...',
      switchPanel: '您可以切换到其他面板继续工作',
      enterDescription: '请输入内容描述',
      describeContent: '请描述您想要生成的文档内容',
      aiConfigInvalid: 'AI配置无效',
      configureApiFirst: '请先在设置中配置并测试API',
      model: '模型',
      config: '配置',
      // 错误提示
      detachedNodeNotFound: '目标节点必须大于当前节点',
      levelMismatchConnect: '目标节点必须大于当前节点',
      childrenMovedToDetached: '子节点已移至断开节点面板',
      parentNodeNotFound: '找不到目标父节点',
      levelMismatchRoot: '当前节点层级与虚拟根节点不匹配',
      levelMismatch: '目标节点必须大于当前节点',
      cycleError: '不能将节点连接到其自身的后代节点下',
      parentChanged: '父节点位置已改变，请重试',
      detachFailed: '断开节点失败',
      nodeNotFound: '找不到要断开的节点',
      maxLevelReached: '已达到最大层级限制（6级），无法继续添加子节点',
    },
    file: {
      newFile: '新建文件',
      newFolder: '新建文件夹',
      rename: '重命名',
      deleteFile: '删除文件',
      deleteFolder: '删除文件夹',
      importFile: '导入文件',
      exportFile: '导出文件',
      fileName: '文件名',
      folderName: '文件夹名',
      untitled: '未命名',
      openFileFailed: '打开文件失败',
      exportSuccess: '导出成功',
      exportFailed: '导出文件失败',
      closeAllTabs: '已关闭所有标签页',
      emptyFolder: '空文件夹',
      dropToImport: '释放以导入文件',
      deleteFolderConfirm: '确定要删除文件夹',
      deleteFolderWarning: '文件夹内的所有文件也将被删除。',
      enterFileName: '请输入文件名：',
      enterFolderName: '请输入文件夹名称：',
      nameAZ: '文件名 (A-Z)',
      nameZA: '文件名 (Z-A)',
      updatedNewToOld: '编辑时间 (从新到旧)',
      updatedOldToNew: '编辑时间 (从旧到新)',
      createdNewToOld: '创建时间 (从新到旧)',
      createdOldToNew: '创建时间 (从旧到新)',
      unsavedChanges: '有未保存的修改',
    },
    node: {
      editNode: '编辑节点',
      deleteNode: '删除节点',
      deleteNodeConfirm: '确定要删除此节点吗？',
      deleteNodeOnly: '仅删除当前节点',
      deleteNodeAndChildren: '删除节点及所有子节点',
      deleteNodeOrphanChildren: '子节点将变为孤立节点',
      nodeTitle: '节点标题',
      nodeContent: '节点内容',
      addChild: '添加子节点',
      metadata: '元数据',
      metadataDescription: '文档元数据',
      childNodes: '个子节点',
      newDocument: '新建文档',
      title: '标题',
      content: '内容',
      enterTitle: '输入节点标题...',
      enterContent: '输入节点内容...',
      markdownSupport: '支持 Markdown 格式，内容将显示在节点下方',
      createChildNodes: '创建子节点',
      createChildNodesUnder: '在「{parent}」下创建 H{level} 子节点',
      quickAdd: '快速添加',
      nodeTitles: '节点标题',
      clear: '清空',
      titlesPlaceholder: '输入子节点标题，每行一个\n例如：\n子节点1\n子节点2\n子节点3',
      titlesDescription: '每行输入一个标题，系统将自动创建为 H{level} 层级的子节点',
      willCreateNodes: '即将创建 {count} 个节点',
      create: '创建',
      cancel: '取消',
      untitled: '未命名',
      newNode: '新节点',
      editFileName: '编辑文件名',
      editNewKey: '编辑新键',
      editNewValue: '编辑新值',
      clickToEdit: '点击上方键或值进行编辑',
      editKey: '编辑键',
      editValue: '编辑值',
      fileName: '文件名',
      untitledDoc: '未命名文档.md',
      clickKeyOrValue: '点击键或值在下方编辑',
      key: '键',
      value: '值',
      newKey: '新键',
      enterFileNamePlaceholder: '在此输入文件名，按 Enter 保存...',
      enterKeyPlaceholder: '在此输入键，按 Enter 保存...',
      enterValuePlaceholder: '在此输入值，按 Enter 保存...',
      clickToEditLongContent: '点击上方的键或值，在此处编辑长内容',
      metadataYaml: 'Metadata 将保存为 YAML 格式',
    },
    canvas: {
      layout: '整理布局',
    },
    sidebar: {
      files: '文件',
      outline: '大纲',
      templates: '模板',
      ai: 'AI',
      git: 'Git',
      settings: '设置',
      help: '帮助',
      aiGenerate: 'AI 文档生成',
      newFile: '创建新文件',
      openFile: '打开文件',
      closeTab: '关闭标签页',
      noFileOpen: '未打开文件',
      selectFromSidebar: '从左侧文件面板选择文件，或从上方标签栏新建文档',
      createNewFolder: '新建文件夹',
      sortByName: '按名称排序',
      sortByDate: '按日期排序',
      expandAll: '展开全部',
      collapseAll: '折叠全部',
      importTemplate: '导入模板',
      addTemplate: '新增模板',
      templateLibrary: '模板库',
      useTemplate: '使用模板',
      previewTemplate: '预览模板',
      editTemplate: '编辑模板',
      deleteTemplate: '删除模板',
      enterDescription: '描述您想要的文档内容',
      quickSend: '按 Ctrl+Enter 快速发送',
      generating: '生成中...',
      config: '配置',
      configured: '已配置并测试通过',
      notConfigured: '未配置或测试未通过，请先配置API',
      newBlankTemplate: '新建空白模板',
      importTemplateFile: '导入模板文件',
      noTemplates: '暂无模板',
      rightClickForMore: '右键点击模板查看更多选项',
      newTemplate: '新建模板',
      aiPlaceholder: '例如：生成一份关于React Hooks的技术文档，包含useState、useEffect和useContext的使用说明和示例代码...',
      noHeadings: '当前文档没有标题',
      useHashToCreate: '使用 # ## ### 等创建标题',
    },
    preview: {
      preview: '文档预览',
      edit: '编辑文档',
      noContent: '没有可预览的内容',
      read: '阅读',
      previewMode: '预览模式',
      editMode: '编辑模式',
      editPlaceholder: '在此编辑 Markdown 文档...',
      markdownEditor: 'Markdown 编辑器',
      noDocumentOpen: '未打开文档',
      characters: '字符',
      lines: '行',
    },
    help: {
      contactAuthor: '联系作者',
      contactDesc: '交流、学习、反馈问题',
      contact: '联系',
      community: '社区讨论',
      communityDesc: '加入群聊，与其他用户交流使用心得',
      join: '加入',
      discordDesc: '加入 Discord 社区，与开发者和其他用户实时交流',
      githubDesc: '查看源代码、提交 Issue 或贡献代码',
      view: '查看',
    },
    settings: {
      title: '设置',
      language: '语言',
      theme: '主题',
      autoSave: '自动保存',
      keyboardShortcuts: '快捷键',
      aiProvider: 'AI 提供商',
      configIncomplete: '配置不完整',
      enterApiInfo: '请填写API地址和密钥',
      connectionSuccess: '连接成功',
      connectionFailed: '连接失败',
      testing: '测试中...',
      testConnection: '测试连接',
      restoreDefault: '恢复默认',
      restored: '已恢复默认配置',
      apiAddress: 'API地址',
      apiKey: 'API密钥',
      modelName: '模型名称',
      keyStoredLocally: '密钥将加密存储在本地',
      configured: '已配置并测试通过',
      notTested: '未测试或测试未通过',
      volcengine: '火山引擎',
      siliconflow: '硅基流动',
      zhipu: '智谱AI',
      qianwen: '通义千问',
      custom: '自定义',
      gitIntegration: 'Git 集成',
      gitConnection: 'Git 连接配置',
      openGitPanel: '打开 Git 面板',
      openGitSettings: '前往 Git 设置',
      gitConfigured: 'Git 配置已填写，可在这里直接连接仓库',
      gitNotConfigured: '请先填写 Git 平台、访问令牌和仓库信息',
    },
    git: {
      provider: '平台',
      token: '访问令牌',
      tokenPlaceholder: 'PAT / 访问令牌',
      namespace: '所有者 / 命名空间',
      repository: '仓库',
      branch: '分支',
      baseUrl: 'API 基础地址',
      customFlavor: '自定义 API',
      connect: '连接',
      reconnect: '重新连接',
      connected: '已连接',
      loadRepos: '加载仓库',
      reposLoaded: '仓库列表已加载',
      availableBranches: '分支',
      repositoryTree: '仓库文件',
      notConnected: '未连接',
      connectFirst: '请先连接仓库',
      emptyRepoTree: '未加载文件',
      pendingChanges: '待提交变更',
      noGitFileOpen: '未打开 Git 文件',
      uncommitted: '未提交',
      commitToRepo: '提交到仓库',
      commitMessagePlaceholder: '提交信息',
      commitSuccess: '提交成功',
      commitFailed: '提交失败',
      draftSaved: '草稿已保存到本地',
      fetchRemote: '获取远程文件',
      remoteUpdated: '远程文件已更新',
      remoteUpToDate: '远程文件已是最新',
      conflictDetected: '检测到冲突',
      localChangesPreserved: '已保留本地草稿',
      lastFetched: '上次获取',
      createFile: '创建 Git 文件',
      createFolder: '创建 Git 文件夹',
      fileCreated: 'Git 文件已创建',
      folderCreated: 'Git 文件夹已创建',
      enterNewPath: '输入新路径',
      targetDirectory: '目标目录',
      targetDirectoryRoot: '目标目录：仓库根目录',
      refreshTree: '刷新仓库文件',
      stageChanges: '暂存变更',
      noStagedChanges: '没有暂存变更',
      stagedCount: '{count} 项已暂存',
      unstage: '取消暂存',
      stagedDeleteFile: '[删除] {name}',
      stagedDeleteFolder: '[删除文件夹] {name}',
      stageToGit: '暂存到 Git',
      stageToGitDescription: '输入此文件在仓库中的目标路径',
      stageConfirm: '暂存',
      stagedToGit: '已暂存到 Git',
    },
    toast: {
      saved: '已保存',
      deleted: '已删除',
      modified: '已修改',
      fileAdded: '文件已添加',
      fileDeleted: '文件已删除',
      folderAdded: '文件夹已添加',
      folderDeleted: '文件夹已删除',
      renameSuccess: '重命名成功',
      importSuccess: '导入成功',
      importFailed: '导入失败',
      saveFailed: '保存失败',
      generateSuccess: '文档生成成功',
      generateFailed: '生成失败',
      templateDeleted: '模板已删除',
      templateCreated: '模板创建成功',
      templateApplied: '模板已应用',
      loadTemplateFailed: '无法加载模板内容',
      formatError: '格式错误',
      selectMarkdownFile: '请选择 Markdown 文件 (.md 或 .markdown)',
      cannotReadFile: '无法读取文件内容',
      loadingTemplates: '加载模板中...',
    },
    template: {
      confirmDelete: '确认删除模板',
      deleteWarning: '删除后无法恢复',
    },
  },
  en: {
    common: {
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      confirm: 'Confirm',
      close: 'Close',
      edit: 'Edit',
      create: 'Create',
      add: 'Add',
      remove: 'Remove',
      loading: 'Loading',
      error: 'Error',
      success: 'Success',
      open: 'Open',
      export: 'Export',
      new: 'New',
      closeAll: 'Close All',
      noOpenTabs: 'No open tabs',
      generate: 'Generate',
      generatingDoc: 'Generating document, please wait...',
      switchPanel: 'You can switch to other panels to continue working',
      enterDescription: 'Please enter content description',
      describeContent: 'Please describe the document content you want to generate',
      aiConfigInvalid: 'AI configuration invalid',
      configureApiFirst: 'Please configure and test API in settings first',
      model: 'Model',
      config: 'Config',
      // Error messages
      detachedNodeNotFound: 'Target node level must be greater than current node',
      levelMismatchConnect: 'Target node level must be greater than current node',
      childrenMovedToDetached: 'Child nodes have been moved to detached panel',
      parentNodeNotFound: 'Target parent node not found',
      levelMismatchRoot: 'Current node level does not match virtual root',
      levelMismatch: 'Target node level must be greater than current node',
      cycleError: 'Cannot connect node to its own descendant',
      parentChanged: 'Parent node position has changed, please try again',
      detachFailed: 'Failed to detach node',
      nodeNotFound: 'Node not found',
      maxLevelReached: 'Maximum level limit reached (6 levels), cannot add more child nodes',
    },
    file: {
      newFile: 'New File',
      newFolder: 'New Folder',
      rename: 'Rename',
      deleteFile: 'Delete File',
      deleteFolder: 'Delete Folder',
      importFile: 'Import File',
      exportFile: 'Export File',
      fileName: 'File Name',
      folderName: 'Folder Name',
      untitled: 'Untitled',
      openFileFailed: 'Failed to open file',
      exportSuccess: 'Export successful',
      exportFailed: 'Failed to export file',
      closeAllTabs: 'All tabs closed',
      emptyFolder: 'Empty folder',
      dropToImport: 'Drop to import file',
      deleteFolderConfirm: 'Are you sure you want to delete folder',
      deleteFolderWarning: 'All files in the folder will also be deleted.',
      enterFileName: 'Please enter file name:',
      enterFolderName: 'Please enter folder name:',
      nameAZ: 'Name (A-Z)',
      nameZA: 'Name (Z-A)',
      updatedNewToOld: 'Updated (New to Old)',
      updatedOldToNew: 'Updated (Old to New)',
      createdNewToOld: 'Created (New to Old)',
      createdOldToNew: 'Created (Old to New)',
      unsavedChanges: 'Unsaved changes',
    },
    node: {
      editNode: 'Edit Node',
      deleteNode: 'Delete Node',
      deleteNodeConfirm: 'Are you sure you want to delete this node?',
      deleteNodeOnly: 'Delete Current Node Only',
      deleteNodeAndChildren: 'Delete Node and All Children',
      deleteNodeOrphanChildren: 'Children will become orphaned nodes',
      nodeTitle: 'Node Title',
      nodeContent: 'Node Content',
      addChild: 'Add Child',
      metadata: 'Metadata',
      metadataDescription: 'Document Metadata',
      childNodes: 'child nodes',
      newDocument: 'New Document',
      title: 'Title',
      content: 'Content',
      enterTitle: 'Enter node title...',
      enterContent: 'Enter node content...',
      markdownSupport: 'Supports Markdown format, content will be displayed below the node',
      createChildNodes: 'Create Child Nodes',
      createChildNodesUnder: 'Create H{level} child nodes under "{parent}"',
      quickAdd: 'Quick Add',
      nodeTitles: 'Node Titles',
      clear: 'Clear',
      titlesPlaceholder: 'Enter child node titles, one per line\nExample:\nChild Node 1\nChild Node 2\nChild Node 3',
      titlesDescription: 'Enter one title per line, system will auto-create H{level} level child nodes',
      willCreateNodes: 'Will create {count} nodes',
      create: 'Create',
      cancel: 'Cancel',
      untitled: 'Untitled',
      newNode: 'New Node',
      editFileName: 'Edit File Name',
      editNewKey: 'Edit New Key',
      editNewValue: 'Edit New Value',
      clickToEdit: 'Click key or value above to edit',
      editKey: 'Edit Key',
      editValue: 'Edit Value',
      fileName: 'File Name',
      untitledDoc: 'Untitled Document.md',
      clickKeyOrValue: 'Click key or value to edit below',
      key: 'Key',
      value: 'Value',
      newKey: 'New Key',
      enterFileNamePlaceholder: 'Enter file name here, press Enter to save...',
      enterKeyPlaceholder: 'Enter key here, press Enter to save...',
      enterValuePlaceholder: 'Enter value here, press Enter to save...',
      clickToEditLongContent: 'Click key or value above to edit long content here',
      metadataYaml: 'Metadata will be saved as YAML format',
    },
    canvas: {
      layout: 'Layout',
    },
    sidebar: {
      files: 'Files',
      outline: 'Outline',
      templates: 'Templates',
      ai: 'AI',
      git: 'Git',
      settings: 'Settings',
      help: 'Help',
      aiGenerate: 'AI Document Generation',
      newFile: 'Create New File',
      openFile: 'Open File',
      closeTab: 'Close Tab',
      noFileOpen: 'No file open',
      selectFromSidebar: 'Select a file from the left panel, or create a new document from the tab bar',
      createNewFolder: 'New Folder',
      sortByName: 'Sort by Name',
      sortByDate: 'Sort by Date',
      expandAll: 'Expand All',
      collapseAll: 'Collapse All',
      importTemplate: 'Import Template',
      addTemplate: 'Add Template',
      templateLibrary: 'Template Library',
      useTemplate: 'Use Template',
      previewTemplate: 'Preview Template',
      editTemplate: 'Edit Template',
      deleteTemplate: 'Delete Template',
      enterDescription: 'Describe the document content you want',
      quickSend: 'Press Ctrl+Enter to send',
      generating: 'Generating...',
      config: 'Config',
      configured: 'Configured and tested',
      notConfigured: 'Not configured or test failed, please configure API first',
      newBlankTemplate: 'New Blank Template',
      importTemplateFile: 'Import Template File',
      noTemplates: 'No Templates',
      rightClickForMore: 'Right-click template for more options',
      newTemplate: 'New Template',
      aiPlaceholder: 'e.g., Generate a technical document about React Hooks, including usage instructions and examples for useState, useEffect, and useContext...',
      noHeadings: 'No headings in current document',
      useHashToCreate: 'Use # ## ### etc. to create headings',
    },
    preview: {
      preview: 'Preview',
      edit: 'Edit',
      noContent: 'No content to preview',
      read: 'Read',
      previewMode: 'Preview Mode',
      editMode: 'Edit Mode',
      editPlaceholder: 'Edit Markdown document here...',
      markdownEditor: 'Markdown Editor',
      noDocumentOpen: 'No document open',
      characters: 'chars',
      lines: 'lines',
    },
    help: {
      contactAuthor: 'Contact Author',
      contactDesc: 'Exchange ideas, learn, and provide feedback',
      contact: 'Contact',
      community: 'Community',
      communityDesc: 'Join the group chat to share experiences with other users',
      join: 'Join',
      discordDesc: 'Join Discord community to chat with developers and users in real-time',
      githubDesc: 'View source code, submit issues, or contribute',
      view: 'View',
    },
    settings: {
      title: 'Settings',
      language: 'Language',
      theme: 'Theme',
      autoSave: 'Auto Save',
      keyboardShortcuts: 'Keyboard Shortcuts',
      aiProvider: 'AI Provider',
      configIncomplete: 'Configuration Incomplete',
      enterApiInfo: 'Please enter API address and key',
      connectionSuccess: 'Connection Successful',
      connectionFailed: 'Connection Failed',
      testing: 'Testing...',
      testConnection: 'Test Connection',
      restoreDefault: 'Restore Default',
      restored: 'Default configuration restored',
      apiAddress: 'API Address',
      apiKey: 'API Key',
      modelName: 'Model Name',
      keyStoredLocally: 'Key will be encrypted and stored locally',
      configured: 'Configured and tested',
      notTested: 'Not tested or test failed',
      volcengine: 'Volcano Engine',
      siliconflow: 'SiliconFlow',
      zhipu: 'Zhipu AI',
      qianwen: 'Tongyi Qianwen',
      custom: 'Custom',
      gitIntegration: 'Git Integration',
      gitConnection: 'Git Connection',
      openGitPanel: 'Open Git Panel',
      openGitSettings: 'Open Git Settings',
      gitConfigured: 'Git configuration is ready. Connect to a repository from here.',
      gitNotConfigured: 'Fill in provider, token, and repository first.',
    },
    git: {
      provider: 'Provider',
      token: 'Access Token',
      tokenPlaceholder: 'PAT / Access Token',
      namespace: 'Owner / Namespace',
      repository: 'Repository',
      branch: 'Branch',
      baseUrl: 'API Base URL',
      customFlavor: 'Custom API',
      connect: 'Connect',
      reconnect: 'Reconnect',
      connected: 'Connected',
      loadRepos: 'Load Repos',
      reposLoaded: 'Repositories loaded',
      availableBranches: 'Branches',
      repositoryTree: 'Repository Tree',
      notConnected: 'Not connected',
      connectFirst: 'Connect a repository first',
      emptyRepoTree: 'No files loaded',
      pendingChanges: 'Pending Changes',
      noGitFileOpen: 'No Git file open',
      uncommitted: 'Uncommitted',
      commitToRepo: 'Commit To Repository',
      commitMessagePlaceholder: 'Commit message',
      commitSuccess: 'Commit successful',
      commitFailed: 'Commit failed',
      draftSaved: 'Draft saved locally',
      fetchRemote: 'Fetch Remote',
      remoteUpdated: 'Remote file updated',
      remoteUpToDate: 'Remote file is up to date',
      conflictDetected: 'Conflict detected',
      localChangesPreserved: 'Local draft preserved',
      lastFetched: 'Last fetched',
      createFile: 'Create Git File',
      createFolder: 'Create Git Folder',
      fileCreated: 'Git file created',
      folderCreated: 'Git folder created',
      enterNewPath: 'Enter new path for',
      targetDirectory: 'Target directory',
      targetDirectoryRoot: 'Target directory: repository root',
      refreshTree: 'Refresh repository tree',
      stageChanges: 'Stage Changes',
      noStagedChanges: 'No staged changes',
      stagedCount: '{count} staged',
      unstage: 'Unstage',
      stagedDeleteFile: '[Delete] {name}',
      stagedDeleteFolder: '[Delete Folder] {name}',
      stageToGit: 'Stage to Git',
      stageToGitDescription: 'Enter repository path for this file',
      stageConfirm: 'Stage',
      stagedToGit: 'Staged to Git',
    },
    toast: {
      saved: 'Saved',
      deleted: 'Deleted',
      modified: 'Modified',
      fileAdded: 'File added',
      fileDeleted: 'File deleted',
      folderAdded: 'Folder added',
      folderDeleted: 'Folder deleted',
      renameSuccess: 'Rename successful',
      importSuccess: 'Import successful',
      importFailed: 'Import failed',
      saveFailed: 'Save failed',
      generateSuccess: 'Document generated successfully',
      generateFailed: 'Generation failed',
      templateDeleted: 'Template deleted',
      templateCreated: 'Template created successfully',
      templateApplied: 'Template applied',
      loadTemplateFailed: 'Failed to load template content',
      formatError: 'Format error',
      selectMarkdownFile: 'Please select a Markdown file (.md or .markdown)',
      cannotReadFile: 'Cannot read file content',
      loadingTemplates: 'Loading templates...',
    },
    template: {
      confirmDelete: 'Confirm Delete Template',
      deleteWarning: 'Cannot be recovered after deletion',
    },
  },
}

/**
 * 获取翻译文本
 * @param key 支持嵌套路径，如 'common.save'
 * @param lang 语言
 * @returns 翻译文本
 */
export function t(key: string, lang: Language = 'zh'): string {
  const keys = key.split('.')
  let value: any = translations[lang]
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k]
    } else {
      // 找不到翻译时返回 key
      return key
    }
  }
  
  return typeof value === 'string' ? value : key
}
