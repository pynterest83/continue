import {
  ComputerDesktopIcon,
  DocumentIcon,
  InformationCircleIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ToolTip } from "../../../components/gui/Tooltip";
import {
  Button,
  Card,
  Divider,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "../../../components/ui";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks";
import { selectPersonas } from "../../../redux/slices/configSlice";
import { setDialogMessage, setShowDialog } from "../../../redux/slices/uiSlice";
import { slugify } from "../../../util/slugify";
import { ConfigHeader } from "../components/ConfigHeader";
import { DEFAULT_PERSONAS, isDefaultPersona } from "./defaultPersonas";

// Persona data model
export interface Persona {
  id: string;
  name: string;
  roleDefinition: string;
  whenToUse: string;
  apiConfiguration?: string; // Optional
  shortDescription?: string; // Optional
  availableTools?: string; // Optional
  customInstructions?: string; // Optional
  isDefault?: boolean; // Flag to indicate if this is a default persona
}

// Preview System Prompt Dialog Component
function PreviewSystemPromptDialog({ persona }: { persona: Persona | null }) {
  const dispatch = useAppDispatch();

  if (!persona) {
    return null;
  }

  // Generate system prompt from persona data
  const systemPrompt = useMemo(() => {
    let prompt = "";

    if (persona.roleDefinition) {
      prompt += `${persona.roleDefinition}\n\n`;
    }

    if (persona.whenToUse) {
      prompt += `When to use: ${persona.whenToUse}\n\n`;
    }

    if (persona.customInstructions) {
      prompt += `Custom Instructions:\n${persona.customInstructions}\n\n`;
    }

    if (persona.availableTools) {
      prompt += `Available Tools: ${persona.availableTools}`;
    }

    return prompt || "No system prompt configured.";
  }, [persona]);

  const handleClose = () => {
    dispatch(setShowDialog(false));
    dispatch(setDialogMessage(undefined));
  };

  return (
    <div className="max-h-[80vh] max-w-2xl overflow-auto p-6">
      <h2 className="mb-4 text-xl font-semibold">Preview System Prompt</h2>
      <div className="mb-4">
        <div className="mb-2 text-sm font-medium">Persona: {persona.name}</div>
        <pre className="bg-vsc-input-background max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border border-gray-600 p-4 text-sm">
          {systemPrompt}
        </pre>
      </div>
      <div className="flex justify-end">
        <Button variant="primary" onClick={handleClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

export function PersonaSection() {
  const dispatch = useAppDispatch();
  const ideMessenger = useContext(IdeMessengerContext);
  const configPersonas = useAppSelector(selectPersonas);

  // Merge default personas with custom personas from config
  const personasFromConfig = useMemo(() => {
    // Create maps for default persona overrides from config
    const defaultPersonaOverrides = new Map<
      string,
      { customInstructions?: string }
    >();
    if (configPersonas) {
      configPersonas.forEach((p: any) => {
        if (isDefaultPersona(p.name)) {
          const overrides: { customInstructions?: string } = {};
          if (p.customInstructions) {
            overrides.customInstructions = p.customInstructions;
          }
          if (Object.keys(overrides).length > 0) {
            defaultPersonaOverrides.set(p.name, overrides);
          }
        }
      });
    }

    // Start with default personas
    const defaultPersonasWithIds: Persona[] = DEFAULT_PERSONAS.map(
      (defaultPersona) => {
        const overrides =
          defaultPersonaOverrides.get(defaultPersona.name) || {};
        return {
          ...defaultPersona,
          customInstructions: overrides.customInstructions || "",
          isDefault: true,
        };
      },
    );

    // Add custom personas (non-default ones from config)
    // Note: personas from config should have id, name, roleDefinition, and whenToUse defined
    const customPersonas: Persona[] = configPersonas
      ? configPersonas
          .filter((m: any) => !isDefaultPersona(m.name))
          .filter((m: any) => m.id && m.name && m.roleDefinition && m.whenToUse) // Only include personas with required fields
          .map((m: any) => {
            return {
              id: m.id,
              name: m.name,
              roleDefinition: m.roleDefinition,
              whenToUse: m.whenToUse,
              apiConfiguration: m.apiConfiguration,
              shortDescription: m.shortDescription,
              availableTools: m.availableTools,
              customInstructions: m.customInstructions,
              isDefault: false,
            };
          })
      : [];

    return [...defaultPersonasWithIds, ...customPersonas];
  }, [configPersonas]);

  const [personas, setPersonas] = useState<Persona[]>(personasFromConfig);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("");
  const [personaName, setPersonaName] = useState<string>("");

  useEffect(() => {
    setPersonas(personasFromConfig);
  }, [personasFromConfig]);

  useEffect(() => {
    if (!selectedPersonaId && personas.length > 0) {
      setSelectedPersonaId(personas[0].id);
    }
  }, [selectedPersonaId, personas]);

  const selectedPersona = useMemo(
    () => personas.find((m) => m.id === selectedPersonaId) || null,
    [personas, selectedPersonaId],
  );

  const [formData, setFormData] = useState<{
    roleDefinition: string;
    whenToUse: string;
    apiConfiguration?: string;
    shortDescription?: string;
    availableTools?: string;
    customInstructions?: string;
  }>({
    roleDefinition: "",
    whenToUse: "",
    apiConfiguration: "default",
    shortDescription: "",
    availableTools: "",
    customInstructions: "",
  });

  // Check if selected persona is a default persona
  const isSelectedPersonaDefault = useMemo(() => {
    return selectedPersona?.isDefault ?? false;
  }, [selectedPersona]);

  // Sync form data and persona name when persona changes
  useEffect(() => {
    if (selectedPersona) {
      setPersonaName(selectedPersona.name);
      setFormData({
        roleDefinition: selectedPersona.roleDefinition,
        whenToUse: selectedPersona.whenToUse,
        apiConfiguration: selectedPersona.apiConfiguration,
        shortDescription: selectedPersona.shortDescription,
        availableTools: selectedPersona.availableTools,
        customInstructions: selectedPersona.customInstructions,
      });
    } else {
      // Reset form when no persona selected
      setPersonaName("");
      setFormData({
        roleDefinition: "",
        whenToUse: "",
        apiConfiguration: "default",
        shortDescription: "",
        availableTools: "",
        customInstructions: "",
      });
    }
  }, [selectedPersona]);

  // Generate unique ID for new persona based on name
  const generatePersonaId = useCallback(
    (name: string) => {
      const baseId = slugify(name);
      // If a persona with this id already exists, append a number
      let id = baseId;
      let counter = 1;
      while (personas.some((p) => p.id === id)) {
        id = `${baseId}-${counter}`;
        counter++;
      }
      return id;
    },
    [personas],
  );

  // Helper function to get personas to save (custom personas + default persona customInstructions)
  const getPersonasToSave = useCallback((personasList: Persona[]) => {
    const result: any[] = [];

    // Add custom personas (non-default)
    personasList
      .filter((p) => !p.isDefault)
      .forEach((p) => {
        result.push({
          id: p.id,
          name: p.name,
          roleDefinition: p.roleDefinition,
          whenToUse: p.whenToUse,
          apiConfiguration: p.apiConfiguration,
          shortDescription: p.shortDescription,
          availableTools: p.availableTools,
          customInstructions: p.customInstructions,
        });
      });

    // Add default personas with only customInstructions (if they have any)
    personasList
      .filter((p) => p.isDefault && p.customInstructions)
      .forEach((p) => {
        result.push({
          name: p.name,
          customInstructions: p.customInstructions,
        });
      });

    return result;
  }, []);

  // Handlers
  const handleAddPersona = useCallback(async () => {
    const personaName = `Persona ${personas.length + 1}`;
    const newPersona: Persona = {
      id: generatePersonaId(personaName),
      name: personaName,
      roleDefinition: "",
      whenToUse: "",
      apiConfiguration: "default",
      shortDescription: "",
      availableTools: "",
      customInstructions: "",
    };
    const updatedPersonas = [...personas, newPersona];
    setPersonas(updatedPersonas);
    setSelectedPersonaId(newPersona.id);
    setPersonaName(newPersona.name);

    // Save to config file (only custom personas and default persona customInstructions)
    const personasToSave = getPersonasToSave(updatedPersonas);
    await ideMessenger.post("config/updatePersonas", personasToSave);
  }, [personas, generatePersonaId, getPersonasToSave, ideMessenger]);

  const handleDeletePersona = useCallback(async () => {
    if (!selectedPersonaId || !selectedPersona) return;

    // Don't allow deleting default personas
    if (selectedPersona.isDefault) {
      return;
    }

    const updatedPersonas = personas.filter((m) => m.id !== selectedPersonaId);
    setPersonas(updatedPersonas);
    setSelectedPersonaId("");

    // Save to config file (only custom personas and default persona customInstructions)
    const personasToSave = getPersonasToSave(updatedPersonas);
    await ideMessenger.post("config/updatePersonas", personasToSave);
  }, [
    personas,
    selectedPersonaId,
    selectedPersona,
    getPersonasToSave,
    ideMessenger,
  ]);

  const handlePersonaSelect = useCallback((personaId: string) => {
    setSelectedPersonaId(personaId);
  }, []);

  const handleUpdateFormData = useCallback(
    <K extends keyof typeof formData>(
      field: K,
      value: (typeof formData)[K],
    ) => {
      // For default personas, only allow editing customInstructions
      if (isSelectedPersonaDefault && field !== "customInstructions") {
        return;
      }
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    [isSelectedPersonaDefault],
  );

  const handleSave = useCallback(async () => {
    if (!selectedPersonaId || !selectedPersona) return;

    // For default personas, only allow saving customInstructions
    if (isSelectedPersonaDefault) {
      const updatedPersonas = personas.map((persona) =>
        persona.id === selectedPersonaId
          ? {
              ...persona,
              customInstructions: formData.customInstructions,
            }
          : persona,
      );
      setPersonas(updatedPersonas);
      const personasToSave = getPersonasToSave(updatedPersonas);
      await ideMessenger.post("config/updatePersonas", personasToSave);
      return;
    }

    // For custom personas, validate required fields
    const trimmedName = personaName.trim() || selectedPersona?.name || "";
    const trimmedRoleDefinition = formData.roleDefinition.trim();
    const trimmedWhenToUse = formData.whenToUse.trim();

    // Validate required fields
    if (!trimmedName) {
      dispatch(
        setDialogMessage(
          <div className="p-4">
            <p>Persona name is required.</p>
          </div>,
        ),
      );
      dispatch(setShowDialog(true));
      return;
    }
    if (!trimmedRoleDefinition) {
      dispatch(
        setDialogMessage(
          <div className="p-4">
            <p>Role Definition is required.</p>
          </div>,
        ),
      );
      dispatch(setShowDialog(true));
      return;
    }
    if (!trimmedWhenToUse) {
      dispatch(
        setDialogMessage(
          <div className="p-4">
            <p>When to Use is required.</p>
          </div>,
        ),
      );
      dispatch(setShowDialog(true));
      return;
    }

    let newId = selectedPersona?.id || "";

    // If name changed, update id (ensure uniqueness)
    if (trimmedName !== selectedPersona?.name) {
      newId = slugify(trimmedName);
      // Ensure id is unique
      let counter = 1;
      while (
        personas.some((p) => p.id === newId && p.id !== selectedPersonaId)
      ) {
        newId = `${slugify(trimmedName)}-${counter}`;
        counter++;
      }
    }

    const updatedPersonas = personas.map((persona) =>
      persona.id === selectedPersonaId
        ? {
            ...persona,
            id: newId,
            name: trimmedName,
            roleDefinition: trimmedRoleDefinition,
            whenToUse: trimmedWhenToUse,
            apiConfiguration: formData.apiConfiguration,
            shortDescription: formData.shortDescription,
            availableTools: formData.availableTools,
            customInstructions: formData.customInstructions,
          }
        : persona,
    );
    setPersonas(updatedPersonas);

    // Save to config file
    const personasToSave = getPersonasToSave(updatedPersonas);
    await ideMessenger.post("config/updatePersonas", personasToSave);
  }, [
    selectedPersonaId,
    selectedPersona,
    formData,
    personaName,
    personas,
    isSelectedPersonaDefault,
    getPersonasToSave,
    ideMessenger,
  ]);

  const handlePreviewSystemPrompt = useCallback(() => {
    if (!selectedPersona) {
      return;
    }

    // Create a temporary persona with current form data for preview
    const previewPersona: Persona = {
      ...selectedPersona,
      ...formData,
    };

    dispatch(setShowDialog(true));
    dispatch(
      setDialogMessage(<PreviewSystemPromptDialog persona={previewPersona} />),
    );
  }, [selectedPersona, formData, dispatch]);

  // Get persona name for display
  const selectedPersonaName = useMemo(() => {
    return selectedPersona?.name || "Select persona";
  }, [selectedPersona]);

  return (
    <div className="space-y-4">
      <ConfigHeader
        title="Personas"
        subtext="Personas are specialized configurations that tailor behavior. Learn about Using Personas or Customizing Personas."
      />

      <Card>
        <div className="space-y-4">
          {/* Persona Selector */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Persona</span>
            <div className="flex items-center gap-2">
              <Listbox value={selectedPersonaId} onChange={handlePersonaSelect}>
                <ListboxButton className="flex-1 justify-between py-2">
                  <div className="flex items-center gap-2">
                    <ComputerDesktopIcon className="h-4 w-4 flex-shrink-0" />
                    <span>{selectedPersonaName}</span>
                  </div>
                </ListboxButton>
                <ListboxOptions>
                  {personas.length > 0 ? (
                    personas.map((persona) => (
                      <ListboxOption key={persona.id} value={persona.id}>
                        <div className="flex items-center justify-between">
                          <span>{persona.name}</span>
                          {persona.isDefault && (
                            <span className="text-2xs ml-auto text-right text-gray-500">
                              (Builtin)
                            </span>
                          )}
                        </div>
                      </ListboxOption>
                    ))
                  ) : (
                    <ListboxOption value="add" onClick={handleAddPersona}>
                      <div className="flex items-center gap-2">
                        <PlusIcon className="h-4 w-4" />
                        <span>Add persona</span>
                      </div>
                    </ListboxOption>
                  )}
                </ListboxOptions>
              </Listbox>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAddPersona}
                  className="h-6 w-6 p-0"
                >
                  <PlusIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDeletePersona}
                  className="h-6 w-6 p-0"
                  disabled={!selectedPersonaId || isSelectedPersonaDefault}
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <Divider />

          {/* Persona Name */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Persona Name</span>
                  {isSelectedPersonaDefault && (
                    <ToolTip
                      content="Builtin personas cannot be renamed"
                      place="top"
                    >
                      <InformationCircleIcon className="h-4 w-4 text-gray-500" />
                    </ToolTip>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {isSelectedPersonaDefault
                    ? "Builtin personas cannot be renamed."
                    : "The name of this persona shown in the persona selector."}
                </div>
              </div>
              {isSelectedPersonaDefault && (
                <span className="text-2xs ml-auto rounded bg-gray-700 px-1.5 py-0.5 text-gray-300">
                  Builtin
                </span>
              )}
            </div>
            <input
              type="text"
              value={personaName}
              onChange={(e) => {
                if (!isSelectedPersonaDefault) {
                  setPersonaName(e.target.value);
                }
              }}
              placeholder="Enter persona name"
              disabled={!selectedPersonaId}
              className="text-vsc-foreground border-command-border bg-vsc-input-background focus:border-border-focus focus:ring-border-focus w-full rounded-md border border-solid px-2 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <Divider />

          {/* Role Definition */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Role Definition</span>
                  {isSelectedPersonaDefault && (
                    <ToolTip
                      content="This field cannot be edited for builtin personas"
                      place="top"
                    >
                      <InformationCircleIcon className="h-4 w-4 text-gray-500" />
                    </ToolTip>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
                  Define expertise and personality for this mode. This
                  description shapes how it presents itself and approaches
                  tasks.
                </div>
              </div>
            </div>
            <textarea
              value={formData.roleDefinition}
              onChange={(e) =>
                handleUpdateFormData("roleDefinition", e.target.value)
              }
              placeholder="You are a highly skilled software engineer with extensive knowledge in many programming languages, frameworks, design patterns, and best practices."
              className="text-vsc-foreground border-command-border bg-vsc-input-background focus:border-border-focus focus:ring-border-focus min-h-24 w-full resize-y rounded-md border border-solid px-2 py-2 text-sm focus:outline-none focus:ring-1"
              rows={4}
            />
          </div>

          <Divider />

          {/* Short description */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    Short description (for humans)
                  </span>
                  {isSelectedPersonaDefault && (
                    <ToolTip
                      content="This field cannot be edited for builtin personas"
                      place="top"
                    >
                      <InformationCircleIcon className="h-4 w-4 text-gray-500" />
                    </ToolTip>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
                  A brief description shown in the mode selector dropdown.
                </div>
              </div>
            </div>
            <input
              type="text"
              value={formData.shortDescription}
              onChange={(e) =>
                handleUpdateFormData("shortDescription", e.target.value)
              }
              placeholder="Write, modify, and refactor code"
              className="text-vsc-foreground border-command-border bg-vsc-input-background focus:border-border-focus focus:ring-border-focus w-full resize-y rounded-md border border-solid px-2 py-1.5 text-sm focus:outline-none focus:ring-1"
            />
          </div>

          <Divider />

          {/* When to Use */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    When to Use (optional)
                  </span>
                  {isSelectedPersonaDefault && (
                    <ToolTip
                      content="This field cannot be edited for builtin personas"
                      place="top"
                    >
                      <InformationCircleIcon className="h-4 w-4 text-gray-500" />
                    </ToolTip>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
                  Guidance for when this mode should be used. This helps the
                  Orchestrator choose the right mode for a task.
                </div>
              </div>
            </div>
            <textarea
              value={formData.whenToUse}
              onChange={(e) =>
                handleUpdateFormData("whenToUse", e.target.value)
              }
              placeholder=""
              className="text-vsc-foreground border-command-border bg-vsc-input-background focus:border-border-focus focus:ring-border-focus w-full rounded-md border border-solid px-2 py-1.5 text-sm focus:outline-none focus:ring-1"
              rows={6}
            />
          </div>

          <Divider />

          {/* Available Tools */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Available Tools</span>
                  {isSelectedPersonaDefault && (
                    <ToolTip
                      content="This field cannot be edited for builtin personas"
                      place="top"
                    >
                      <InformationCircleIcon className="h-4 w-4 text-gray-500" />
                    </ToolTip>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
                  Tools for built-in modes cannot be modified.
                </div>
              </div>
            </div>
            <input
              type="text"
              value={formData.availableTools}
              onChange={(e) =>
                handleUpdateFormData("availableTools", e.target.value)
              }
              placeholder="Read Files, Edit Files, Use Browser, Run Commands, Use MCP"
              className="text-vsc-foreground border-command-border bg-vsc-input-background focus:border-border-focus focus:ring-border-focus w-full rounded-md border border-solid px-2 py-1.5 text-sm focus:outline-none focus:ring-1"
            />
          </div>

          <Divider />

          {/* Mode-specific Custom Instructions */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  Mode-specific Custom Instructions (optional)
                </span>
                <div className="mt-0.5 text-xs text-gray-500">
                  Add behavioral guidelines specific to this mode.
                </div>
              </div>
            </div>
            <textarea
              value={formData.customInstructions}
              onChange={(e) =>
                handleUpdateFormData("customInstructions", e.target.value)
              }
              placeholder=""
              className="text-vsc-foreground border-command-border bg-vsc-input-background focus:border-border-focus focus:ring-border-focus min-h-32 w-full resize-y rounded-md border border-solid px-2 py-2 text-sm focus:outline-none focus:ring-1"
              rows={6}
            />
            <div className="text-xs text-gray-500">
              Custom instructions for this mode can also be loaded automatically
              from rules-code folders in your workspace or from global
              configuration. Older configuration folders are deprecated and will
              not be supported in the future.
            </div>
          </div>

          <Divider />

          {/* Preview System Prompt and Save */}
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={handlePreviewSystemPrompt}
              className="w-fit"
              disabled={!selectedPersonaId}
            >
              <DocumentIcon className="mr-2 h-4 w-4" />
              Preview System Prompt
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              className="w-fit"
              disabled={!selectedPersonaId}
            >
              Save
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
