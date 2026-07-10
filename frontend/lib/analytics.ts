"use client";

import { trackEvent } from "@/lib/openpanel";

type CountBucket = "0" | "1" | "2_5" | "6_20" | "21_plus";

export function countBucket(value: number): CountBucket {
  if (value <= 0) return "0";
  if (value === 1) return "1";
  if (value <= 5) return "2_5";
  if (value <= 20) return "6_20";
  return "21_plus";
}

function variant() {
  return process.env.NEXT_PUBLIC_PROPOSAL_VARIANT ?? "base";
}

export function trackHomeAction(action: string, position: number) {
  trackEvent("home_action_clicked", {
    action,
    position,
    variant: variant(),
  });
}

export function trackPersonSearchStarted(source: string, hasQuery: boolean) {
  trackEvent("person_search_started", { source, hasQuery });
}

export function trackPersonSearchResultsLoaded(args: {
  source: string;
  resultsCount: number;
  page: number;
}) {
  trackEvent("person_search_results_loaded", {
    source: args.source,
    page: args.page,
    results_count_bucket: countBucket(args.resultsCount),
  });
  if (args.resultsCount === 0) {
    trackEvent("person_search_no_results", { source: args.source });
  }
}

export function trackMissingReportStarted(source: string) {
  trackEvent("missing_report_started", { source });
}

export function trackMissingReportAfterNoResults(source: string) {
  trackEvent("report_missing_cta_after_no_results_clicked", { source });
}

export function trackPersonDetailViewed(args: {
  status?: "active" | "found";
  hasPhoto: boolean;
  hasHospitalLink?: boolean;
  source: string;
}) {
  trackEvent("person_detail_viewed", {
    status: args.status ?? "active",
    hasPhoto: args.hasPhoto,
    hasHospitalLink: Boolean(args.hasHospitalLink),
    source: args.source,
  });
}

export function trackFoundReportStarted(source: string) {
  trackEvent("found_report_started", { source });
}

export function trackHospitalListViewed(source: string) {
  trackEvent("hospital_list_viewed", { source });
}

export function trackHospitalFilterUsed(filterType: string, zone?: string) {
  trackEvent("hospital_filter_used", {
    filterType,
    zone: zone ?? null,
  });
}

export function trackHospitalPatientSearchStarted(hasQuery: boolean) {
  trackEvent("hospital_patient_search_started", { hasQuery });
}

export function trackHospitalPatientSearchResultsLoaded(resultsCount: number) {
  trackEvent("hospital_patient_search_results_loaded", {
    results_count_bucket: countBucket(resultsCount),
  });
}

export function trackHospitalDetailViewed(args: {
  priorityZone?: string;
  patientCount: number;
  source: string;
}) {
  trackEvent("hospital_detail_viewed", {
    priorityZone: args.priorityZone ?? null,
    has_patients_bucket: countBucket(args.patientCount),
    source: args.source,
  });
}

export function trackHelpResourceClicked(resource: string, source: string) {
  trackEvent("help_resource_clicked", { resource, source });
}

export function trackInternationalHelpClicked(source: string, countryCode?: string | null) {
  trackEvent("international_help_clicked", {
    source,
    countryCode: countryCode ?? null,
  });
}

export function trackVolunteerPathClicked(volunteerType: string, source: string) {
  trackEvent("volunteer_path_clicked", {
    volunteerType,
    source,
  });
}

export function trackMapOpened(source: string) {
  trackEvent("map_opened", { source });
}

export function trackFormError(form: string, fieldGroup: string, errorType: string) {
  trackEvent("form_error_shown", {
    form,
    fieldGroup,
    errorType,
  });
}
