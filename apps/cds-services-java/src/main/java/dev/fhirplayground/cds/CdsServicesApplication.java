package dev.fhirplayground.cds;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.servlet.Filter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

// Java port of apps/cds-services/src/server.ts. CDS Hooks spec: https://cds-hooks.org — the EHR GETs
// /cds-services to discover what we offer, then POSTs a hook request to /cds-services/<id> and renders
// the cards we return.
@SpringBootApplication
@RestController
public class CdsServicesApplication {

  // Only the Patient fields this service reads; every one can be missing (FHIR 0..*).
  @JsonIgnoreProperties(ignoreUnknown = true)
  record HumanName(List<String> given, String family) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  record Patient(List<HumanName> name) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  record Prefetch(Patient patient) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  record HookRequest(Prefetch prefetch) {}

  static final List<Map<String, Object>> SERVICES = List.of(
      Map.of(
          "hook", "patient-view",
          "id", "patient-greeting",
          "title", "Patient greeting",
          "description", "Says hello to the patient whose chart was opened.",
          // The EHR fetches this before calling us and sends it in request.prefetch.patient.
          "prefetch", Map.of("patient", "Patient/{{context.patientId}}")));

  private final JsonMapper json;

  CdsServicesApplication(JsonMapper json) {
    this.json = json;
  }

  public static void main(String[] args) {
    SpringApplication.run(CdsServicesApplication.class, args);
  }

  static Map<String, Object> greetingCards(Patient patient) {
    HumanName name = patient == null || patient.name() == null || patient.name().isEmpty() ? null : patient.name().get(0);
    String given = name == null || name.given() == null ? null : String.join(" ", name.given());
    String display = Stream.of(given, name == null ? null : name.family())
        .filter(s -> s != null && !s.isEmpty())
        .collect(Collectors.joining(" "));
    return Map.of("cards", List.of(Map.of(
        "summary", "Hello " + (display.isEmpty() ? "there" : display) + "!",
        "indicator", "info",
        "source", Map.of("label", "fhir playground CDS service"))));
  }

  @GetMapping("/health")
  Map<String, Object> health() {
    return Map.of("ok", true);
  }

  @GetMapping("/cds-services")
  Map<String, Object> discovery() {
    return Map.of("services", SERVICES);
  }

  // Raw String body so, like the TS service, any Content-Type is accepted and bad JSON gets our 400.
  @PostMapping("/cds-services/patient-greeting")
  ResponseEntity<?> patientGreeting(@RequestBody(required = false) String body) {
    HookRequest request;
    try {
      request = json.readValue(Objects.requireNonNullElse(body, ""), HookRequest.class);
    } catch (JacksonException e) {
      return ResponseEntity.badRequest().body(Map.of("error", "body must be JSON"));
    }
    return ResponseEntity.ok(greetingCards(request == null || request.prefetch() == null ? null : request.prefetch().patient()));
  }

  @ExceptionHandler(NoResourceFoundException.class)
  ResponseEntity<?> notFound() {
    return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
  }

  // The CDS Hooks sandbox calls us straight from the browser, so every response carries CORS headers.
  @Bean
  Filter cors() {
    return (req, res, chain) -> {
      HttpServletResponse http = (HttpServletResponse) res;
      http.setHeader("Access-Control-Allow-Origin", "*");
      http.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      http.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      if ("OPTIONS".equals(((HttpServletRequest) req).getMethod())) {
        http.setStatus(HttpServletResponse.SC_NO_CONTENT);
        return;
      }
      chain.doFilter(req, res);
    };
  }
}
