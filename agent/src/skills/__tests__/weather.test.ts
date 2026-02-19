import { describe, expect, it, vi } from "vitest";
import { createWeatherSkill } from "../built-in/weather.js";

const skill = createWeatherSkill();

describe("skill_weather", () => {
	it("has correct metadata", () => {
		expect(skill.name).toBe("skill_weather");
		expect(skill.tier).toBe(0);
		expect(skill.requiresGateway).toBe(false);
		expect(skill.source).toBe("built-in");
	});

	it("returns error when location is empty", async () => {
		const result = await skill.execute({ location: "" }, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("location is required");
	});

	it("returns error when location is missing", async () => {
		const result = await skill.execute({}, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("location is required");
	});

	it("fetches weather from wttr.in", async () => {
		const mockResponse = {
			current_condition: [
				{
					temp_C: "22",
					temp_F: "72",
					weatherDesc: [{ value: "Sunny" }],
					humidity: "45",
					windspeedKmph: "10",
					winddir16Point: "NW",
					FeelsLikeC: "20",
					uvIndex: "5",
				},
			],
			nearest_area: [
				{
					areaName: [{ value: "Seoul" }],
					country: [{ value: "South Korea" }],
				},
			],
		};

		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(JSON.stringify(mockResponse), { status: 200 }),
		);

		const result = await skill.execute({ location: "Seoul" }, {});
		expect(result.success).toBe(true);

		const output = JSON.parse(result.output);
		expect(output.location).toBe("Seoul");
		expect(output.temperature).toBe("22°C (72°F)");
		expect(output.condition).toBe("Sunny");
		expect(output.humidity).toBe("45%");

		expect(fetchSpy).toHaveBeenCalledWith(
			expect.stringContaining("wttr.in/Seoul"),
			expect.any(Object),
		);

		fetchSpy.mockRestore();
	});

	it("handles API error response", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

		const result = await skill.execute({ location: "INVALID_PLACE" }, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("404");

		fetchSpy.mockRestore();
	});

	it("handles fetch failure", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockRejectedValueOnce(new Error("Network error"));

		const result = await skill.execute({ location: "Seoul" }, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("Network error");

		fetchSpy.mockRestore();
	});

	it("handles empty current_condition", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(JSON.stringify({ current_condition: [] }), {
				status: 200,
			}),
		);

		const result = await skill.execute({ location: "Nowhere" }, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("No weather data");

		fetchSpy.mockRestore();
	});
});
