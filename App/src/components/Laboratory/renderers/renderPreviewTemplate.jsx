import EstheticPremium from "../../../templates/esthetic/EstheticPremium";

// futuros templates
// import LawyerPremium from "../templates/lawyer/LawyerPremium";

export function renderPreviewTemplate(preview, onBack) {
  const templateMap = {
    "esthetic-premium": EstheticPremium,

    // futuros:
    // "lawyer-premium": LawyerPremium,
  };

  const TemplateComponent = templateMap[preview.template_key];

  if (!TemplateComponent) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="font-bold">
          Template "{preview.template_key}" não encontrado.
        </p>
      </div>
    );
  }

  return (
    <TemplateComponent
      preview={preview}
      onBack={onBack}
    />
  );
}