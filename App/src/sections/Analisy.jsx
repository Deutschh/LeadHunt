import React, { useEffect, useState } from "react";

// Pegando a URL correta igual você faz no App.jsx
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const AnalysisPage = () => {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Agora usamos a API_URL completa
    fetch(`${API_URL}/api/leads/stats/dashboard`)
      .then((res) => {
        if (!res.ok) throw new Error("Falha ao buscar dados do servidor");
        return res.json();
      })
      .then((data) => setStats(data))
      .catch((err) => {
        console.error("Erro na análise:", err);
        setError(err.message);
      });
  }, []);

  if (error) return <div className="p-8 text-red-500">Erro: {error}</div>;
  if (!stats)
    return (
      <div className="p-8 text-center text-slate-500">
        Carregando métricas de elite...
      </div>
    );

  // ... restante do código do componente (o return que te passei antes)

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">
        📊 Centro de Comando LeadHunt
      </h1>

      {/* CARDS DE KPIS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-blue-500">
          <p className="text-sm text-gray-500 font-medium">Total de Leads</p>
          <p className="text-2xl font-bold text-gray-800">
            {stats.summary.total_leads}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-green-500">
          <p className="text-sm text-gray-500 font-medium">Contatados</p>
          <p className="text-2xl font-bold text-gray-800">
            {stats.summary.total_contacted}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-orange-400">
          <p className="text-sm text-gray-500 font-medium">Interessados 🔥</p>
          <p className="text-2xl font-bold text-gray-800">
            {stats.summary.total_interested}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-red-500">
          <p className="text-sm text-gray-500 font-medium">Números Inválidos</p>
          <p className="text-2xl font-bold text-gray-800">
            {stats.summary.total_invalid}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* RANKING POR CIDADE */}
        <div className="bg-white p-6 rounded-xl shadow-sm">
          <h3 className="text-lg font-bold mb-4">
            📍 Onde está o dinheiro (Cidades)
          </h3>
          <div className="space-y-4">
            {stats.cities.map((city) => (
              <div key={city.lead_city}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{city.lead_city}</span>
                  <span className="font-bold">{city.count} leads</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{
                      width: `${(city.count / stats.summary.total_leads) * 100}%`,
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RANKING POR CATEGORIA */}
        <div className="bg-white p-6 rounded-xl shadow-sm">
          <h3 className="text-lg font-bold mb-4">🏆 Melhores Nichos</h3>
          <div className="space-y-4">
            {stats.categories.map((cat) => (
              <div
                key={cat.lead_category}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <span className="font-medium text-gray-700">
                  {cat.lead_category}
                </span>
                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">
                  {cat.count} prospectados
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisPage;
