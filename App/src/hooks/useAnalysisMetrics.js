import { useMemo } from "react";

export default function useAnalysisMetrics({
  filteredLeadsByPeriod,
  sendingNumbers,
  core,
}) {
  const followupMetrics = useMemo(() => {
    const leadsWithFollowup = filteredLeadsByPeriod.filter(
      (lead) => Number(lead.followup_count || 0) > 0,
    );

    const totalFollowupsSent = leadsWithFollowup.reduce(
      (acc, lead) => acc + Number(lead.followup_count || 0),
      0,
    );

    const scheduledFollowups = filteredLeadsByPeriod.filter(
      (lead) =>
        lead.status === "contacted" &&
        !lead.last_reply_at &&
        !!lead.next_followup_at &&
        !lead.is_archived,
    ).length;

    const recoveredByFollowup = filteredLeadsByPeriod.filter(
      (lead) =>
        Number(lead.followup_count || 0) > 0 &&
        (lead.status === "responded" ||
          lead.pipeline_stage === "responded" ||
          lead.pipeline_stage === "interested" ||
          lead.pipeline_stage === "preview_sent" ||
          lead.pipeline_stage === "negotiation" ||
          lead.pipeline_stage === "closed"),
    ).length;

    const leadsInFollowup = filteredLeadsByPeriod.filter(
      (lead) =>
        Number(lead.followup_count || 0) > 0 &&
        !lead.last_reply_at &&
        lead.status === "contacted" &&
        !lead.is_archived,
    ).length;

    const followupRate =
      core.sent > 0 ? (totalFollowupsSent / core.sent) * 100 : 0;

    const recoveryRate =
      leadsWithFollowup.length > 0
        ? (recoveredByFollowup / leadsWithFollowup.length) * 100
        : 0;

    return {
      totalFollowupsSent,
      scheduledFollowups,
      recoveredByFollowup,
      leadsInFollowup,
      followupRate,
      recoveryRate,
    };
  }, [filteredLeadsByPeriod, core.sent]);

  const chipMetrics = useMemo(() => {
    const chipMap = new Map();

    filteredLeadsByPeriod.forEach((lead) => {
      const chip = lead.assigned_number || "Sem chip";

      if (!chipMap.has(chip)) {
        chipMap.set(chip, {
          chip,
          leads: 0,
          sent: 0,
          replied: 0,
          engaged: 0,
          previews: 0,
          negotiation: 0,
          closed: 0,
          revenue: 0,
          followups: 0,
        });
      }

      const item = chipMap.get(chip);
      item.leads += 1;

      const stage = lead.pipeline_stage || "";
      const status = lead.status || "";

      if (
        [
          "contacted",
          "responded",
          "interested",
          "preview_sent",
          "negotiation",
          "closed",
        ].includes(stage) ||
        status === "contacted"
      ) {
        item.sent += 1;
      }

      if (
        [
          "responded",
          "interested",
          "preview_sent",
          "negotiation",
          "closed",
        ].includes(stage) ||
        status === "responded"
      ) {
        item.replied += 1;
      }

      if (
        ["interested", "preview_sent", "negotiation", "closed"].includes(stage)
      ) {
        item.engaged += 1;
      }

      if (
        lead.preview_sent ||
        ["preview_sent", "negotiation", "closed"].includes(stage)
      ) {
        item.previews += 1;
      }

      if (
        stage === "negotiation" ||
        status === "negotiation" ||
        status === "negociacao"
      ) {
        item.negotiation += 1;
      }

      if (stage === "closed" || status === "closed") {
        item.closed += 1;
      }

      item.revenue += Number(lead.sale_value || 0);
      item.followups += Number(lead.followup_count || 0);
    });

    return Array.from(chipMap.values())
      .map((item) => ({
        ...item,
        responseRate: item.sent > 0 ? (item.replied / item.sent) * 100 : 0,
        conversionRate: item.sent > 0 ? (item.closed / item.sent) * 100 : 0,
        avgTicket: item.closed > 0 ? item.revenue / item.closed : 0,
      }))
      .sort((a, b) => {
        if (b.closed !== a.closed) return b.closed - a.closed;
        if (b.revenue !== a.revenue) return b.revenue - a.revenue;
        return b.responseRate - a.responseRate;
      });
  }, [filteredLeadsByPeriod]);

  const sendingSummary = useMemo(() => {
    const active = sendingNumbers.filter((n) => n.is_active).length;
    const healthy = sendingNumbers.filter(
      (n) => n.health_status === "healthy",
    ).length;
    const warning = sendingNumbers.filter(
      (n) => n.health_status === "warning",
    ).length;
    const paused = sendingNumbers.filter(
      (n) =>
        n.health_status === "paused" ||
        (n.paused_until && new Date(n.paused_until) > new Date()),
    ).length;

    return { active, healthy, warning, paused };
  }, [sendingNumbers]);

  return {
    followupMetrics,
    chipMetrics,
    sendingSummary,
  };
}
