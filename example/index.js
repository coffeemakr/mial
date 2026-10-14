import { Mial } from "mial";
import { domains } from "mial/domains";
import { tlds } from "mial/tlds";
import { DnsChecker } from "mial/dns";

const mial = new Mial({ tlds, domains });
const dnsChecker = new DnsChecker({
  endpoint: "https://cloudflare-dns.com/dns-query",
  knownDomains: domains,
});

// Wait until the user stops typing before looking up the domain
const DNS_CHECK_DELAY_MS = 400;
let dnsCheckTimer;
let dnsCheckController;

const emailInput = document.getElementById("email-input");

const recommendationList = document.getElementById("recommendation-list");

const recommendationContainer = document.getElementById("recommendation-container");

const invalidMessage = document.getElementById("invalid-message");
const recommendationMessage = document.getElementById("recommendation-message");
const dnsMessage = document.getElementById("dns-message");

emailInput.addEventListener("input", (event) => {
  const email = event.target.value;
  const recommendation = mial.recommend(email);
  const isInvalid = mial.isInvalid(email);

  // Clear the current list
  recommendationList.innerHTML = "";
  recommendationContainer.style.display = "none"; // Hide the container by default
  emailInput.classList.remove("invalid"); // Remove the invalid class
  invalidMessage.style.display = "none"; // Hide "The email address might be incorrect" by default
  recommendationMessage.style.display = "none"; // Hide "Did you mean:" by default
  dnsMessage.style.display = "none"; // Hide the DNS message by default
  console.log(recommendation, 'recommendation', email, isInvalid);

  // Show the container and invalid message if the email is invalid
  if (isInvalid) {
    recommendationContainer.style.display = "block"; // Show the container
    invalidMessage.style.display = "block"; // Show "The email address might be incorrect"
    emailInput.classList.add("invalid"); // Add the invalid class
  }

  // Populate the list with the recommendation
  if (recommendation) {
    recommendationMessage.style.display = "block"; // Show "Did you mean:"
    const recommendationItem = document.createElement("button");
    recommendationItem.textContent = recommendation;
    recommendationItem.addEventListener("click", () => {
      emailInput.value = recommendation;
      recommendationList.innerHTML = ""; // Clear the list after selection
      recommendationContainer.style.display = "none"; // Hide the container after selection
      emailInput.classList.remove("invalid"); // Remove the invalid class
    });
    recommendationList.appendChild(recommendationItem);
  }

  // Cancel the check of the previous input
  clearTimeout(dnsCheckTimer);
  dnsCheckController?.abort();

  // Only look up the domain if there is no other hint
  if (!isInvalid && !recommendation) {
    const controller = new AbortController();
    dnsCheckController = controller;
    dnsCheckTimer = setTimeout(async () => {
      try {
        const result = await dnsChecker.check(email, { signal: controller.signal });
        // Only warn on a definitive answer, never on "unknown"
        if (result.status === "invalid") {
          recommendationContainer.style.display = "block";
          dnsMessage.style.display = "block";
          emailInput.classList.add("invalid");
        }
      } catch {
        // Aborted by a newer input
      }
    }, DNS_CHECK_DELAY_MS);
  }
});
