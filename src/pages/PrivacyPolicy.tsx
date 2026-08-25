export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow">
        <h1 className="text-3xl font-bold mb-6 text-gray-900">Política de Privacidad</h1>
        
        <div className="prose prose-blue text-gray-700 space-y-4">
          <p>Última actualización: {new Date().toLocaleDateString()}</p>
          
          <h2 className="text-xl font-semibold mt-6 text-gray-800">1. Información que recopilamos</h2>
          <p>
            En "Ya Llega", recopilamos información necesaria para brindar nuestro servicio de delivery, 
            incluyendo nombre, dirección de entrega, número de teléfono y datos de ubicación (cuando la app está en uso) 
            para garantizar que los pedidos lleguen a su destino correctamente.
          </p>

          <h2 className="text-xl font-semibold mt-6 text-gray-800">2. Uso de la información</h2>
          <p>
            Utilizamos su información personal única y exclusivamente para:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Procesar y entregar sus pedidos.</li>
            <li>Comunicarnos sobre el estado de su entrega.</li>
            <li>Mejorar nuestro servicio al cliente.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-6 text-gray-800">3. Compartir información</h2>
          <p>
            No vendemos ni alquilamos su información personal a terceros. La información (como su dirección y teléfono) 
            solo se comparte con el conductor asignado y el comercio para poder procesar la entrega exitosamente.
          </p>

          <h2 className="text-xl font-semibold mt-6 text-gray-800">4. Seguridad</h2>
          <p>
            Implementamos medidas de seguridad para proteger su información personal. Las credenciales de acceso 
            y los datos personales se transfieren de manera encriptada.
          </p>

          <h2 className="text-xl font-semibold mt-6 text-gray-800">5. Contacto</h2>
          <p>
            Si tiene alguna pregunta sobre esta política de privacidad, puede contactarnos al correo soporte de la aplicación.
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <a href="/" className="text-blue-600 hover:text-blue-800 font-medium">
            &larr; Volver a la página principal
          </a>
        </div>
      </div>
    </div>
  );
}
