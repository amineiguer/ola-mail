import { NextRequest, NextResponse } from "next/server";
import { getAttachment, getAuthenticatedClient } from "@/lib/gmail";
import { uploadContractToGHL } from "@/lib/ghl";
import { getTokens, getEmailsCache, saveEmailsCache } from "@/lib/storage";

export async function POST(request: NextRequest) {
  let emailId: string | undefined;
  let attachmentId: string | undefined;
  let filename: string | undefined;

  try {
    const body = await request.json();
    emailId = body.emailId;
    attachmentId = body.attachmentId;
    filename = body.filename;
  } catch {
    return NextResponse.json(
      { error: "Corps de requête invalide" },
      { status: 400 }
    );
  }

  if (!emailId || !attachmentId || !filename) {
    return NextResponse.json(
      { error: "emailId, attachmentId et filename sont requis" },
      { status: 400 }
    );
  }

  // Check authentication
  const tokens = await getTokens();
  if (!tokens || !tokens.access_token) {
    return NextResponse.json(
      { error: "Non authentifié. Veuillez connecter Gmail." },
      { status: 401 }
    );
  }

  try {
    // Get the email and its analysis from cache
    const cache = await getEmailsCache();
    const cachedEmail = cache?.find((e) => e.id === emailId);

    if (!cachedEmail?.analysis?.isContract) {
      return NextResponse.json(
        { error: "Cet email n'est pas identifié comme un contrat. Analysez-le d'abord." },
        { status: 400 }
      );
    }

    const propertyName = cachedEmail.analysis.propertyName || "Propriété Inconnue";

    // Download the attachment from Gmail
    const authClient = await getAuthenticatedClient(tokens);
    const attachmentData = await getAttachment(authClient, emailId, attachmentId);

    if (!attachmentData) {
      return NextResponse.json(
        { error: "Impossible de télécharger la pièce jointe" },
        { status: 404 }
      );
    }

    // Upload to GHL
    const uploadResult = await uploadContractToGHL({
      fileData: attachmentData,
      filename,
      propertyName,
    });

    // Update cache
    if (cache) {
      const ghlUploadData = {
        uploaded: uploadResult.success,
        folderId: uploadResult.folderId,
        fileUrl: uploadResult.fileUrl,
        uploadedAt: new Date().toISOString(),
        error: uploadResult.error,
      };

      const updatedCache = cache.map((e) =>
        e.id === emailId ? { ...e, ghlUpload: ghlUploadData } : e
      );
      await saveEmailsCache(updatedCache);
    }

    if (!uploadResult.success) {
      return NextResponse.json(
        {
          error: uploadResult.error || "Échec de l'upload vers GHL",
          ghlUpload: {
            uploaded: false,
            error: uploadResult.error,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      ghlUpload: {
        uploaded: true,
        folderId: uploadResult.folderId,
        fileUrl: uploadResult.fileUrl,
        uploadedAt: new Date().toISOString(),
      },
      message: `Contrat uploadé avec succès dans Contrat/${propertyName}/`,
    });
  } catch (error) {
    console.error("Erreur lors de l'upload vers GHL:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json(
      { error: `Erreur lors de l'upload: ${errorMessage}` },
      { status: 500 }
    );
  }
}
