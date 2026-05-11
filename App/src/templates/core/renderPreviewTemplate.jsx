import EstheticPremium from "../esthetic/EstheticPremium";

// futuros templates
// import LawyerPremium from "../lawyer/LawyerPremium";
// import RestaurantPremium from "../restaurant/RestaurantPremium";

export function renderPreviewTemplate(preview, onBack) {
  switch (preview.template_key) {
    case "esthetic-premium":
      return <EstheticPremium preview={preview} onBack={onBack} />;

    // case "lawyer-premium":
    //   return (
    //     <LawyerPremium
    //       preview={preview}
    //       onBack={onBack}
    //     />
    //   );

    default:
      return <EstheticPremium preview={preview} onBack={onBack} />;
  }
}
