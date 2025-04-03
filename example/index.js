import { Mial } from "mial";
import { tlds } from "mial/tlds";

const mial = new Mial({
  tlds,
  // Most common email domains (germanyn, switzerland, usa, etc.)
  domains: [
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "icloud.com",
    "live.com",
    "aol.com",
    "mail.com",
    "protonmail.com",
    "gmx.com",
    "gmx.ch",
    "bluewin.ch",
    "web.de",
    "yandex.com",
    "mail.ru",
    "zoho.com",
    "fastmail.com",
    "t-online.de",
    "freenet.de",
    "1und1.de",
    "posteo.de",
    "t-online.ch",
    "swisscom.ch",
    "sunrise.ch",
    "telekom.de",
    "vodafone.de",
    "o2.de",
    "unitymedia.de",
    "kabelbw.de",
    "kabeldeutschland.de",
    "alice.de",
    "versatel.de",
    "netcologne.de",
    "netcable.de",
    "m-net.de",
    "1und1.com",
    "webmail.co.za",
  ],
});

const emailInput = document.getElementById("email-input");

const recommendationList = document.getElementById("recommendation-list");

const recommendationContainer = document.getElementById("recommendation-container");

const invalidMessage = document.getElementById("invalid-message");
const recommendationMessage = document.getElementById("recommendation-message");

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
});
