const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface GHLContact {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  locationId?: string;
  tags?: string[];
}

export interface GHLPipelineStage {
  id: string;
  name: string;
}

export interface GHLPipeline {
  id: string;
  name: string;
  stages: GHLPipelineStage[];
}

export interface UploadOptions {
  fileData: Buffer;
  filename: string;
  propertyName: string;
}

export interface UploadResult {
  success: boolean;
  folderId?: string;
  fileUrl?: string;
  error?: string;
  isMock?: boolean;
}

export interface FolderResult {
  id: string;
  name: string;
}

function getApiKey(): string | null {
  return process.env.GHL_API_KEY || null;
}

function getLocationId(): string | null {
  return process.env.GHL_LOCATION_ID || null;
}

function getHeaders(): Record<string, string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("GHL_API_KEY non configurée");
  return {
    Authorization: `Bearer ${apiKey}`,
    Version: GHL_API_VERSION,
  };
}

async function ensureFolder(
  parentFolderName: string,
  subFolderName: string
): Promise<string> {
  const locationId = getLocationId();
  if (!locationId) throw new Error("GHL_LOCATION_ID non configurée");

  // Search for existing parent folder "Contrat"
  const searchRes = await fetch(
    `${GHL_API_BASE}/medias/folders?locationId=${locationId}&name=${encodeURIComponent(parentFolderName)}`,
    {
      method: "GET",
      headers: getHeaders(),
    }
  );

  let parentFolderId: string | null = null;

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    const folders = searchData.folders || searchData.data || [];
    const existing = folders.find(
      (f: { name: string; id: string }) => f.name === parentFolderName
    );
    if (existing) {
      parentFolderId = existing.id;
    }
  }

  // Create parent folder if it doesn't exist
  if (!parentFolderId) {
    const createParentRes = await fetch(`${GHL_API_BASE}/medias/folders`, {
      method: "POST",
      headers: {
        ...getHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        locationId,
        name: parentFolderName,
      }),
    });

    if (!createParentRes.ok) {
      const errData = await createParentRes.json();
      throw new Error(
        `Impossible de créer le dossier "${parentFolderName}": ${JSON.stringify(errData)}`
      );
    }

    const createData = await createParentRes.json();
    parentFolderId = createData.id || createData.folder?.id;
  }

  if (!parentFolderId) {
    throw new Error(`Impossible d'obtenir l'ID du dossier "${parentFolderName}"`);
  }

  // Search for sub-folder [Property Name] under Contrat
  const subSearchRes = await fetch(
    `${GHL_API_BASE}/medias/folders?locationId=${locationId}&name=${encodeURIComponent(subFolderName)}&parentId=${parentFolderId}`,
    {
      method: "GET",
      headers: getHeaders(),
    }
  );

  let subFolderId: string | null = null;

  if (subSearchRes.ok) {
    const subData = await subSearchRes.json();
    const subFolders = subData.folders || subData.data || [];
    const existingSub = subFolders.find(
      (f: { name: string; id: string }) => f.name === subFolderName
    );
    if (existingSub) {
      subFolderId = existingSub.id;
    }
  }

  // Create sub-folder if not exists
  if (!subFolderId) {
    const createSubRes = await fetch(`${GHL_API_BASE}/medias/folders`, {
      method: "POST",
      headers: {
        ...getHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        locationId,
        name: subFolderName,
        parentId: parentFolderId,
      }),
    });

    if (!createSubRes.ok) {
      const errData = await createSubRes.json();
      throw new Error(
        `Impossible de créer le dossier "${subFolderName}": ${JSON.stringify(errData)}`
      );
    }

    const createSubData = await createSubRes.json();
    subFolderId = createSubData.id || createSubData.folder?.id;
  }

  if (!subFolderId) {
    throw new Error(`Impossible d'obtenir l'ID du sous-dossier "${subFolderName}"`);
  }

  return subFolderId;
}

export async function uploadContractToGHL(
  options: UploadOptions
): Promise<UploadResult> {
  const apiKey = getApiKey();
  const locationId = getLocationId();

  // If no GHL API key, return mock success
  if (!apiKey || !locationId) {
    console.log(
      "[GHL Mock] Aucune clé API GHL configurée — simulation d'upload réussi"
    );
    return {
      success: true,
      folderId: `mock-folder-${Date.now()}`,
      fileUrl: `https://mock-ghl.example.com/media/Contrat/${encodeURIComponent(options.propertyName)}/${options.filename}`,
      isMock: true,
    };
  }

  try {
    // Sanitize property name for folder (remove special chars)
    const sanitizedPropertyName = options.propertyName
      .replace(/[<>:"/\\|?*]/g, "_")
      .trim()
      .substring(0, 100);

    // Ensure folder structure: Contrat/[Property Name]
    const folderId = await ensureFolder("Contrat", sanitizedPropertyName);

    // Upload file
    const formData = new FormData();
    const uint8Array = new Uint8Array(options.fileData);
    const blob = new Blob([uint8Array], { type: "application/pdf" });
    formData.append("file", blob, options.filename);
    formData.append("folderId", folderId);
    formData.append("locationId", locationId);

    const uploadRes = await fetch(`${GHL_API_BASE}/medias/upload-file`, {
      method: "POST",
      headers: getHeaders(),
      body: formData,
    });

    if (!uploadRes.ok) {
      const errData = await uploadRes.json();
      throw new Error(
        `Échec de l'upload: ${JSON.stringify(errData)}`
      );
    }

    const uploadData = await uploadRes.json();
    const fileUrl =
      uploadData.fileUrl ||
      uploadData.url ||
      uploadData.file?.url ||
      undefined;

    return {
      success: true,
      folderId,
      fileUrl,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Erreur GHL inconnue";
    console.error("Erreur GHL upload:", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ── Contacts ─────────────────────────────────────────────────────────────────

export async function searchContacts(query: string): Promise<GHLContact[]> {
  const locationId = getLocationId();
  if (!locationId) throw new Error("GHL_LOCATION_ID non configurée");

  const res = await fetch(
    `${GHL_API_BASE}/contacts/?locationId=${locationId}&query=${encodeURIComponent(query)}&limit=10`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Erreur recherche contacts: ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  return (data.contacts ?? data.data ?? []) as GHLContact[];
}

export async function getContact(contactId: string): Promise<GHLContact> {
  const res = await fetch(`${GHL_API_BASE}/contacts/${contactId}`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Contact introuvable");
  const data = await res.json();
  return (data.contact ?? data) as GHLContact;
}

export async function createContact(params: {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
}): Promise<GHLContact> {
  const locationId = getLocationId();
  if (!locationId) throw new Error("GHL_LOCATION_ID non configurée");

  const res = await fetch(`${GHL_API_BASE}/contacts/`, {
    method: "POST",
    headers: { ...getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ locationId, ...params }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Erreur création contact: ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  return (data.contact ?? data) as GHLContact;
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export async function addContactNote(
  contactId: string,
  body: string,
  userId?: string
): Promise<{ id: string }> {
  const res = await fetch(`${GHL_API_BASE}/contacts/${contactId}/notes`, {
    method: "POST",
    headers: { ...getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ body, userId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Erreur ajout note: ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  return { id: data.note?.id ?? data.id ?? "ok" };
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function createContactTask(
  contactId: string,
  params: {
    title: string;
    dueDate?: string;
    description?: string;
    assignedTo?: string;
  }
): Promise<{ id: string }> {
  const res = await fetch(`${GHL_API_BASE}/contacts/${contactId}/tasks`, {
    method: "POST",
    headers: { ...getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      title: params.title,
      dueDate: params.dueDate,
      description: params.description,
      assignedTo: params.assignedTo,
      status: "incompleted",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Erreur création tâche: ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  return { id: data.task?.id ?? data.id ?? "ok" };
}

// ── Opportunities ─────────────────────────────────────────────────────────────

export async function getPipelines(): Promise<GHLPipeline[]> {
  const locationId = getLocationId();
  if (!locationId) throw new Error("GHL_LOCATION_ID non configurée");

  const res = await fetch(
    `${GHL_API_BASE}/opportunities/pipelines?locationId=${locationId}`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Erreur chargement pipelines: ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  return (data.pipelines ?? data.data ?? []) as GHLPipeline[];
}

export async function createOpportunity(params: {
  name: string;
  pipelineId: string;
  stageId: string;
  contactId?: string;
  monetaryValue?: number;
  status?: string;
}): Promise<{ id: string }> {
  const locationId = getLocationId();
  if (!locationId) throw new Error("GHL_LOCATION_ID non configurée");

  const res = await fetch(`${GHL_API_BASE}/opportunities/`, {
    method: "POST",
    headers: { ...getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      locationId,
      name: params.name,
      pipelineId: params.pipelineId,
      stageId: params.stageId,
      contactId: params.contactId,
      monetaryValue: params.monetaryValue,
      status: params.status ?? "open",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Erreur création opportunité: ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  return { id: data.opportunity?.id ?? data.id ?? "ok" };
}

// ── Conversations / Messages ──────────────────────────────────────────────────

export async function sendConversationMessage(
  contactId: string,
  message: string,
  type: "SMS" | "Email" | "WhatsApp" = "SMS"
): Promise<{ id: string }> {
  const locationId = getLocationId();
  if (!locationId) throw new Error("GHL_LOCATION_ID non configurée");

  // First get or create conversation
  const convRes = await fetch(
    `${GHL_API_BASE}/conversations/search?locationId=${locationId}&contactId=${contactId}`,
    { headers: getHeaders() }
  );

  let conversationId: string | null = null;
  if (convRes.ok) {
    const convData = await convRes.json();
    const convs = convData.conversations ?? [];
    if (convs.length > 0) conversationId = convs[0].id;
  }

  if (!conversationId) {
    const createConvRes = await fetch(`${GHL_API_BASE}/conversations/`, {
      method: "POST",
      headers: { ...getHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ locationId, contactId }),
    });
    if (!createConvRes.ok) {
      const err = await createConvRes.json().catch(() => ({}));
      throw new Error(`Erreur création conversation: ${JSON.stringify(err)}`);
    }
    const createConvData = await createConvRes.json();
    conversationId = createConvData.conversation?.id ?? createConvData.id;
  }

  if (!conversationId) throw new Error("Impossible d'obtenir la conversation");

  const msgRes = await fetch(`${GHL_API_BASE}/conversations/messages`, {
    method: "POST",
    headers: { ...getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      type,
      conversationId,
      message,
    }),
  });
  if (!msgRes.ok) {
    const err = await msgRes.json().catch(() => ({}));
    throw new Error(`Erreur envoi message: ${JSON.stringify(err)}`);
  }
  const msgData = await msgRes.json();
  return { id: msgData.message?.id ?? msgData.id ?? "ok" };
}

// ── Folders (existing) ────────────────────────────────────────────────────────

export async function createFolder(name: string, parentId?: string): Promise<FolderResult> {
  const locationId = getLocationId();
  if (!locationId) throw new Error("GHL_LOCATION_ID non configurée");

  const body: Record<string, string> = { locationId, name };
  if (parentId) body.parentId = parentId;

  const res = await fetch(`${GHL_API_BASE}/medias/folders`, {
    method: "POST",
    headers: {
      ...getHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(`Impossible de créer le dossier: ${JSON.stringify(errData)}`);
  }

  const data = await res.json();
  return {
    id: data.id || data.folder?.id,
    name: data.name || data.folder?.name || name,
  };
}
