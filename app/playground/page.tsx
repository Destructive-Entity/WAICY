import type { Metadata } from "next";
import { Playground } from "@/components/playground/playground";
import { PageIntro } from "@/components/page-intro";

export const metadata: Metadata = {
  title: "Playground | CISA",
  description: "Compile a question into CISA bytecode, then step through the virtual machine and watch continuous registers change.",
};

export default function PlaygroundPage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-12">
      <PageIntro
        kicker="Interactive"
        title="Step through a thought"
        lead="Twelve people and thirty-six relationships live superposed inside one 1024-number memory vector. Pick a question, then step through the program. Every line is a discrete, readable opcode; every register is continuous."
      />
      <Playground />
    </div>
  );
}
