'use client';

interface FlowViewProps {
  repositoryId: string;
  showLegend: boolean;
}

export function FlowView({}: FlowViewProps) {

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      {/* Flow Visualization */}
      <div className="flex-1 relative bg-[#1a1a1a]">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-96 h-64 mx-auto mb-5 border-2 border-dashed border-gray-700 rounded-lg flex items-center justify-center">
              <div className="text-gray-500">
                <div className="text-2xl mb-5">Data Flow Visualization</div>
                <div className="text-base">Sankey diagram will render here</div>
                <div className="text-base mt-5">Showing parameter passing & return flows</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
