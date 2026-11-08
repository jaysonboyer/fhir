package dev.fhirplayground.cds;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;

// Same cases as apps/cds-services/src/server.test.ts, over real HTTP.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CdsServicesApplicationTests {

  @Value("${local.server.port}")
  int port;

  final HttpClient http = HttpClient.newHttpClient();

  HttpResponse<String> send(String method, String path, String body) throws Exception {
    HttpRequest.BodyPublisher publisher =
        body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body);
    return http.send(
        HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).method(method, publisher).build(),
        HttpResponse.BodyHandlers.ofString());
  }

  @Test
  void discoveryAndPatientGreeting() throws Exception {
    assertTrue(send("GET", "/cds-services", null).body().contains("\"id\":\"patient-greeting\""));

    var res = send("POST", "/cds-services/patient-greeting", """
        {"hook":"patient-view","prefetch":{"patient":{"resourceType":"Patient","name":[{"given":["Ada"],"family":"Lovelace"}]}}}""");
    assertEquals(200, res.statusCode());
    assertTrue(res.body().contains("\"summary\":\"Hello Ada Lovelace!\""), res.body());

    assertEquals(400, send("POST", "/cds-services/patient-greeting", "nope").statusCode());
  }

  @Test
  void healthPreflightNotFoundAndUnnamedPatient() throws Exception {
    assertEquals("{\"ok\":true}", send("GET", "/health", null).body());

    var preflight = send("OPTIONS", "/cds-services/patient-greeting", null);
    assertEquals(204, preflight.statusCode());
    assertEquals("*", preflight.headers().firstValue("access-control-allow-origin").orElse(null));

    var missing = send("GET", "/nope", null);
    assertEquals(404, missing.statusCode());
    assertEquals("*", missing.headers().firstValue("access-control-allow-origin").orElse(null));

    var unnamed = send("POST", "/cds-services/patient-greeting", """
        {"hook":"patient-view","prefetch":{"patient":{"resourceType":"Patient"}}}""");
    assertTrue(unnamed.body().contains("\"summary\":\"Hello there!\""), unnamed.body());
  }
}
